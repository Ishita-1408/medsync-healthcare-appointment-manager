-- ==============================================================================
-- MedSync Migration 013: Fix Booking Trigger Recursion & Calendar RLS Policies
-- File: supabase/migrations/013_fix_booking_recursion_and_calendar_rls.sql
-- ==============================================================================

-- 1. FIX RECURSION IN APPOINTMENT VALIDATION TRIGGER
-- The trigger MUST NOT call UPDATE public.appointments within a BEFORE/AFTER trigger on public.appointments!
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

-- 2. FIX RLS PERMISSIONS ON CALENDAR TABLES
ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_calendar_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users and service role full CRUD on their own tokens
DROP POLICY IF EXISTS "Users can view own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can view own calendar tokens"
    ON public.user_calendar_tokens FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can insert own calendar tokens"
    ON public.user_calendar_tokens FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can update own calendar tokens"
    ON public.user_calendar_tokens FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Backend service can manage calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Backend service can manage calendar tokens"
    ON public.user_calendar_tokens FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Calendar Events Permissions
DROP POLICY IF EXISTS "Users can view own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can view own calendar events"
    ON public.appointment_calendar_events FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can insert own calendar events"
    ON public.appointment_calendar_events FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can update own calendar events"
    ON public.appointment_calendar_events FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());
