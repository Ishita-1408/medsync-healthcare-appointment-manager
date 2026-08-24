-- ==============================================================================
-- MedSync Migration 005: Bulletproof Booking & Concurrency Protection
-- File: supabase/migrations/005_booking_concurrency_protection.sql
-- ==============================================================================

-- 1. SWEEP FUNCTION FOR EXPIRED HOLDS & ABANDONED HELD APPOINTMENTS
CREATE OR REPLACE FUNCTION public.sweep_expired_appointments_and_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_expired_appts INTEGER := 0;
    v_expired_holds INTEGER := 0;
BEGIN
    -- 1. Clean up expired HELD appointments in public.appointments
    WITH cleared AS (
        UPDATE public.appointments
        SET status = 'CANCELLED',
            hold_expires_at = NULL,
            cancellation_reason = 'Hold expired automatically',
            updated_at = timezone('utc'::text, now())
        WHERE status = 'HELD'
          AND hold_expires_at IS NOT NULL
          AND hold_expires_at <= timezone('utc'::text, now())
        RETURNING id
    )
    SELECT count(*) INTO v_expired_appts FROM cleared;

    -- 2. Clean up expired active holds in public.appointment_holds (if table exists)
    BEGIN
        WITH cleared_holds AS (
            UPDATE public.appointment_holds
            SET status = 'EXPIRED',
                updated_at = timezone('utc'::text, now())
            WHERE status = 'ACTIVE'
              AND expires_at <= timezone('utc'::text, now())
            RETURNING id
        )
        SELECT count(*) INTO v_expired_holds FROM cleared_holds;
    EXCEPTION WHEN undefined_table THEN
        v_expired_holds := 0;
    END;

    RETURN v_expired_appts + v_expired_holds;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. VALIDATION TRIGGER ON APPOINTMENTS
-- Prevents booking during leaves, outside working hours, or on stale slots
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_appointment_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_conflict_count INTEGER;
    v_day_of_week INTEGER;
    v_appt_start_time TIME;
    v_appt_end_time TIME;
    v_has_working_hours BOOLEAN;
    v_within_hours BOOLEAN;
BEGIN
    -- Only check constraints on active appointments (HELD or CONFIRMED)
    IF NEW.status IN ('HELD', 'CONFIRMED') THEN

        -- 1. Validate against doctor leaves
        SELECT count(*) INTO v_conflict_count
        FROM public.doctor_leaves l
        WHERE l.doctor_id = NEW.doctor_id
          AND tstzrange(l.start_time, l.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)');

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'Cannot book appointment: The selected time interval falls during scheduled doctor leave.';
        END IF;

        -- 2. Validate against configured doctor working hours (if configured)
        v_day_of_week := EXTRACT(DOW FROM NEW.start_time AT TIME ZONE 'UTC')::INTEGER;
        v_appt_start_time := (NEW.start_time AT TIME ZONE 'UTC')::TIME;
        v_appt_end_time := (NEW.end_time AT TIME ZONE 'UTC')::TIME;

        SELECT EXISTS (
            SELECT 1 FROM public.doctor_working_hours
            WHERE doctor_id = NEW.doctor_id AND is_active = true
        ) INTO v_has_working_hours;

        IF v_has_working_hours THEN
            SELECT EXISTS (
                SELECT 1 FROM public.doctor_working_hours
                WHERE doctor_id = NEW.doctor_id
                  AND day_of_week = v_day_of_week
                  AND is_active = true
                  AND start_time <= v_appt_start_time
                  AND end_time >= v_appt_end_time
            ) INTO v_within_hours;

            IF NOT v_within_hours THEN
                -- Allow booking if within standard hours or fallback, but warn if explicitly off
                SELECT EXISTS (
                    SELECT 1 FROM public.doctor_working_hours
                    WHERE doctor_id = NEW.doctor_id
                      AND day_of_week = v_day_of_week
                      AND is_active = false
                ) INTO v_within_hours;

                IF v_within_hours THEN
                    RAISE EXCEPTION 'Cannot book appointment: The doctor is not working on this day of the week.';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_appointment_booking ON public.appointments;
CREATE TRIGGER trg_validate_appointment_booking
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_appointment_booking();

-- ------------------------------------------------------------------------------
-- 3. ATOMIC BOOKING FUNCTION: book_appointment_atomic
-- Performs single-transaction booking with automatic hold release & race-condition safety
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
    p_doctor_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_status TEXT DEFAULT 'HELD',
    p_hold_duration_minutes INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_patient_id UUID;
    v_appointment_id UUID;
    v_hold_expires_at TIMESTAMPTZ;
BEGIN
    v_patient_id := auth.uid();
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to book an appointment.';
    END IF;

    -- Clean up any expired holds/appointments first
    PERFORM public.sweep_expired_appointments_and_holds();

    IF p_status = 'HELD' THEN
        v_hold_expires_at := timezone('utc'::text, now()) + (p_hold_duration_minutes || ' minutes')::interval;
    ELSE
        v_hold_expires_at := NULL;
    END IF;

    -- Insert into appointments. PostgreSQL GiST exclusion constraint guarantees
    -- engine-level race condition protection (error code 23P01 on overlap)
    INSERT INTO public.appointments (
        patient_id,
        doctor_id,
        start_time,
        end_time,
        status,
        hold_expires_at
    )
    VALUES (
        v_patient_id,
        p_doctor_id,
        p_start_time,
        p_end_time,
        p_status,
        v_hold_expires_at
    )
    RETURNING id INTO v_appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'patient_id', v_patient_id,
        'doctor_id', p_doctor_id,
        'start_time', p_start_time,
        'end_time', p_end_time,
        'status', p_status,
        'hold_expires_at', v_hold_expires_at
    );
EXCEPTION
    WHEN exclusion_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'SLOT_ALREADY_BOOKED',
            'message', 'This time slot is no longer available. Please choose another slot.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', SQLSTATE,
            'message', SQLERRM
        );
END;
$$;
