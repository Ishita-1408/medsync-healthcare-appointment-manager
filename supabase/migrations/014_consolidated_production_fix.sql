-- ==============================================================================
-- MedSync Migration 014: Consolidated Production Fix & Missing Tables
-- File: supabase/migrations/014_consolidated_production_fix.sql
-- ==============================================================================

-- ==============================================================================
-- 1. FIX APPOINTMENT TRIGGER RECURSION (STACK DEPTH LIMIT EXCEEDED)
-- ==============================================================================

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

-- Allow backend calendar / email jobs to read appointment details
DROP POLICY IF EXISTS "Backend service can read appointments for sync" ON public.appointments;
CREATE POLICY "Backend service can read appointments for sync"
    ON public.appointments FOR SELECT
    TO anon, authenticated
    USING (true);

-- Standalone sweep function (never called from within row triggers)

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

-- ==============================================================================
-- 2. GOOGLE CALENDAR TOKENS & EVENTS TABLES
-- ==============================================================================

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

DROP POLICY IF EXISTS "Backend service can manage calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Backend service can manage calendar events"
    ON public.appointment_calendar_events FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 3. NOTIFICATIONS TABLE (MIGRATION 008)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'IN_APP',
    status TEXT NOT NULL DEFAULT 'UNREAD',
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ==============================================================================
-- 4. AI CLINICAL SUMMARIES TABLES (MIGRATIONS 009 & 010)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ai_pre_visit_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    intake_id UUID NOT NULL REFERENCES public.appointment_intakes(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    urgency TEXT NOT NULL DEFAULT 'Low' CHECK (urgency IN ('Low', 'Medium', 'High')),
    chief_complaint TEXT NOT NULL,
    suggested_questions JSONB NOT NULL DEFAULT '[]'::JSONB,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.ai_pre_visit_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors and Patients view pre-visit summaries" ON public.ai_pre_visit_summaries;
CREATE POLICY "Doctors and Patients view pre-visit summaries"
    ON public.ai_pre_visit_summaries FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.ai_post_visit_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES public.consultation_notes(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    diagnosis_explanation TEXT NOT NULL,
    medications JSONB NOT NULL DEFAULT '[]'::JSONB,
    follow_up JSONB NOT NULL DEFAULT '{}'::JSONB,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.ai_post_visit_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors and Patients view post-visit summaries" ON public.ai_post_visit_summaries;
CREATE POLICY "Doctors and Patients view post-visit summaries"
    ON public.ai_post_visit_summaries FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

-- ==============================================================================
-- 5. EMAIL NOTIFICATION QUEUE (MIGRATION 011)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.email_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (email_type IN (
        'BOOKING_CONFIRMATION',
        'APPOINTMENT_REMINDER_24H',
        'APPOINTMENT_REMINDER_2H',
        'APPOINTMENT_CANCELLATION'
    )),
    subject TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'PROCESSING',
        'SENT',
        'RETRY',
        'FAILED',
        'CANCELLED'
    )),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_error TEXT,
    provider_message_id TEXT,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_appointment_email_job 
    ON public.email_jobs(appointment_id, email_type) 
    WHERE (status <> 'CANCELLED');

ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own email jobs" ON public.email_jobs;
CREATE POLICY "Users can view own email jobs"
    ON public.email_jobs FOR SELECT
    TO authenticated
    USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.claim_next_email_job(p_worker_id TEXT)
RETURNS SETOF public.email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    WITH candidate AS (
        SELECT id
        FROM public.email_jobs
        WHERE (
            (status IN ('PENDING', 'RETRY') AND next_retry_at <= timezone('utc'::text, now()))
            OR
            (status = 'PROCESSING' AND locked_at < timezone('utc'::text, now()) - INTERVAL '5 minutes')
        )
        ORDER BY next_retry_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_jobs e
    SET status = 'PROCESSING',
        locked_at = timezone('utc'::text, now()),
        locked_by = p_worker_id,
        updated_at = timezone('utc'::text, now())
    FROM candidate
    WHERE e.id = candidate.id
    RETURNING e.*;
END;
$$;
