-- ==============================================================================
-- MedSync Migration 014: Final Calendar Sync & Booking Recursion Fix
-- File: supabase/migrations/014_final_calendar_and_booking_fix.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ELIMINATE RECURSION IN APPOINTMENT VALIDATION TRIGGER
-- The trigger MUST NOT call UPDATE public.appointments inside a BEFORE/AFTER trigger on public.appointments!
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
                -- Check if explicitly inactive on this day
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
-- 2. STANDALONE SWEEP FUNCTION (CALLED BY RPCS / CRON, NEVER INSIDE ROW TRIGGER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_appointments_and_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_expired_appts INTEGER := 0;
BEGIN
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

    RETURN v_expired_appts;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. USER_CALENDAR_TOKENS TABLE & RLS POLICIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google',
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    scope TEXT,
    google_email TEXT,
    is_connected BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Token policies
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

DROP POLICY IF EXISTS "Users can delete own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can delete own calendar tokens"
    ON public.user_calendar_tokens FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role has full access to calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Service role has full access to calendar tokens"
    ON public.user_calendar_tokens FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. APPOINTMENT_CALENDAR_EVENTS TABLE & RLS POLICIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED')),
    html_link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unq_appointment_user_event UNIQUE (appointment_id, user_id)
);

ALTER TABLE public.appointment_calendar_events ENABLE ROW LEVEL SECURITY;

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
