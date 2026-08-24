-- ==============================================================================
-- MedSync Migration 018: Reliable Appointment Email Triggers & Queue Processing
-- File: supabase/migrations/018_fix_appointment_email_triggers.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_appointment_email_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_name TEXT;
    v_doctor_specialty TEXT;
    v_patient_name TEXT;
    v_patient_email TEXT;
    v_date_str TEXT;
    v_time_str TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- Fetch doctor details
    SELECT 
        trim(coalesce(p.first_name || ' ' || p.last_name, 'Doctor')),
        coalesce(dp.specialization, 'General Practitioner')
    INTO v_doctor_name, v_doctor_specialty
    FROM public.profiles p
    LEFT JOIN public.doctor_profiles dp ON dp.id = p.id
    WHERE p.id = NEW.doctor_id;

    -- Fetch patient details from profiles + auth.users
    SELECT 
        trim(coalesce(p.first_name || ' ' || p.last_name, 'Patient')),
        u.email
    INTO v_patient_name, v_patient_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = NEW.patient_id;

    -- Fallback email query from auth.users directly
    IF v_patient_email IS NULL THEN
        SELECT email INTO v_patient_email FROM auth.users WHERE id = NEW.patient_id;
    END IF;

    -- Formatted readable strings in UTC
    v_date_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'FMMonth DD, YYYY');
    v_time_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'HH12:MI AM UTC');

    -- =========================================================================
    -- EVENT 1: APPOINTMENT CREATED OR CONFIRMED
    -- =========================================================================
    IF (TG_OP = 'INSERT' AND NEW.status IN ('HELD', 'CONFIRMED'))
       OR (TG_OP = 'UPDATE' AND OLD.status = 'HELD' AND NEW.status = 'CONFIRMED') THEN

        IF v_patient_email IS NOT NULL THEN
            -- 1. Immediate Booking Confirmation Email Job
            INSERT INTO public.email_jobs (
                appointment_id,
                recipient_id,
                recipient_email,
                recipient_name,
                email_type,
                subject,
                payload,
                status,
                next_retry_at
            )
            VALUES (
                NEW.id,
                NEW.patient_id,
                v_patient_email,
                v_patient_name,
                'BOOKING_CONFIRMATION',
                'Your MedSync Appointment is Confirmed — Dr. ' || v_doctor_name,
                jsonb_build_object(
                    'doctor_name', v_doctor_name,
                    'doctor_specialty', v_doctor_specialty,
                    'patient_name', v_patient_name,
                    'date_str', v_date_str,
                    'time_str', v_time_str,
                    'status', NEW.status
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;

            -- 2. 24-Hour Reminder Email Job (Scheduled)
            IF NEW.start_time > (v_now + INTERVAL '24 hours') THEN
                INSERT INTO public.email_jobs (
                    appointment_id,
                    recipient_id,
                    recipient_email,
                    recipient_name,
                    email_type,
                    subject,
                    payload,
                    status,
                    next_retry_at
                )
                VALUES (
                    NEW.id,
                    NEW.patient_id,
                    v_patient_email,
                    v_patient_name,
                    'APPOINTMENT_REMINDER_24H',
                    'Reminder: Your MedSync Appointment is Tomorrow — Dr. ' || v_doctor_name,
                    jsonb_build_object(
                        'doctor_name', v_doctor_name,
                        'doctor_specialty', v_doctor_specialty,
                        'patient_name', v_patient_name,
                        'date_str', v_date_str,
                        'time_str', v_time_str
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '24 hours'
                )
                ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;

            -- 3. 2-Hour Reminder Email Job (Scheduled)
            IF NEW.start_time > (v_now + INTERVAL '2 hours') THEN
                INSERT INTO public.email_jobs (
                    appointment_id,
                    recipient_id,
                    recipient_email,
                    recipient_name,
                    email_type,
                    subject,
                    payload,
                    status,
                    next_retry_at
                )
                VALUES (
                    NEW.id,
                    NEW.patient_id,
                    v_patient_email,
                    v_patient_name,
                    'APPOINTMENT_REMINDER_2H',
                    'Reminder: Your MedSync Appointment is in 2 Hours — Dr. ' || v_doctor_name,
                    jsonb_build_object(
                        'doctor_name', v_doctor_name,
                        'doctor_specialty', v_doctor_specialty,
                        'patient_name', v_patient_name,
                        'date_str', v_date_str,
                        'time_str', v_time_str
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '2 hours'
                )
                ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;
        END IF;
    END IF;

    -- =========================================================================
    -- EVENT 2: APPOINTMENT CANCELLED
    -- =========================================================================
    IF TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
        -- Cancel all pending or retrying reminder jobs for this appointment
        UPDATE public.email_jobs
        SET status = 'CANCELLED',
            updated_at = v_now
        WHERE appointment_id = NEW.id AND status IN ('PENDING', 'RETRY');

        -- Queue single cancellation email to the patient
        IF v_patient_email IS NOT NULL THEN
            INSERT INTO public.email_jobs (
                appointment_id,
                recipient_id,
                recipient_email,
                recipient_name,
                email_type,
                subject,
                payload,
                status,
                next_retry_at
            )
            VALUES (
                NEW.id,
                NEW.patient_id,
                v_patient_email,
                v_patient_name,
                'APPOINTMENT_CANCELLATION',
                'Your MedSync Appointment Has Been Cancelled — Dr. ' || v_doctor_name,
                jsonb_build_object(
                    'doctor_name', v_doctor_name,
                    'doctor_specialty', v_doctor_specialty,
                    'patient_name', v_patient_name,
                    'date_str', v_date_str,
                    'time_str', v_time_str
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
        END IF;
    END IF;

    -- =========================================================================
    -- EVENT 3: APPOINTMENT RESCHEDULED (start_time changed)
    -- =========================================================================
    IF TG_OP = 'UPDATE' AND OLD.start_time <> NEW.start_time AND NEW.status IN ('HELD', 'CONFIRMED') THEN
        -- Update 24H reminder scheduled time
        UPDATE public.email_jobs
        SET next_retry_at = NEW.start_time - INTERVAL '24 hours',
            payload = jsonb_set(
                jsonb_set(payload, '{date_str}', to_jsonb(v_date_str)),
                '{time_str}', to_jsonb(v_time_str)
            ),
            updated_at = v_now
        WHERE appointment_id = NEW.id 
          AND email_type = 'APPOINTMENT_REMINDER_24H'
          AND status IN ('PENDING', 'RETRY');

        -- Update 2H reminder scheduled time
        UPDATE public.email_jobs
        SET next_retry_at = NEW.start_time - INTERVAL '2 hours',
            payload = jsonb_set(
                jsonb_set(payload, '{date_str}', to_jsonb(v_date_str)),
                '{time_str}', to_jsonb(v_time_str)
            ),
            updated_at = v_now
        WHERE appointment_id = NEW.id 
          AND email_type = 'APPOINTMENT_REMINDER_2H'
          AND status IN ('PENDING', 'RETRY');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_email_jobs ON public.appointments;
CREATE TRIGGER trg_appointment_email_jobs
    AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_email_jobs();
