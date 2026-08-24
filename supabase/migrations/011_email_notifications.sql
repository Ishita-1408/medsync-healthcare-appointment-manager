-- ==============================================================================
-- MedSync Migration 011: Transactional Email Notification & Background Queue
-- File: supabase/migrations/011_email_notifications.sql
-- ==============================================================================

-- 1. EMAIL JOBS TABLE
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

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_email_jobs_status_retry ON public.email_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_appointment ON public.email_jobs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_recipient ON public.email_jobs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_type ON public.email_jobs(email_type);

-- Deduplication: Strict unique index preventing duplicate active email jobs per appointment and type
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_appointment_email_job 
    ON public.email_jobs(appointment_id, email_type) 
    WHERE (status <> 'CANCELLED');

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_email_jobs_updated_at ON public.email_jobs;
CREATE TRIGGER trg_email_jobs_updated_at
    BEFORE UPDATE ON public.email_jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own email delivery records
DROP POLICY IF EXISTS "Users can view own email jobs" ON public.email_jobs;
CREATE POLICY "Users can view own email jobs"
    ON public.email_jobs FOR SELECT
    TO authenticated
    USING (recipient_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. ATOMIC BACKGROUND JOB CLAIMING FUNCTION
-- Uses FOR UPDATE SKIP LOCKED to ensure multiple workers never clash
-- ------------------------------------------------------------------------------
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
            -- Normal pending or retryable jobs that are due
            (status IN ('PENDING', 'RETRY') AND next_retry_at <= timezone('utc'::text, now()))
            OR
            -- Crash recovery: job locked in PROCESSING for > 5 minutes without completion
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

-- ------------------------------------------------------------------------------
-- 4. AUTOMATED DATABASE EVENT TRIGGER FOR EMAIL JOBS
-- Creates and updates email jobs asynchronously upon booking, reschedule, or cancel
-- ------------------------------------------------------------------------------
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
BEGIN
    -- Fetch doctor details
    SELECT 
        coalesce(p.first_name || ' ' || p.last_name, 'Doctor'),
        coalesce(dp.specialization, 'General Practitioner')
    INTO v_doctor_name, v_doctor_specialty
    FROM public.profiles p
    LEFT JOIN public.doctor_profiles dp ON dp.id = p.id
    WHERE p.id = NEW.doctor_id;

    -- Fetch patient details
    SELECT 
        coalesce(p.first_name || ' ' || p.last_name, 'Patient'),
        coalesce(p.email, u.email)
    INTO v_patient_name, v_patient_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = NEW.patient_id;

    -- Fallback email if profile email is empty
    IF v_patient_email IS NULL THEN
        SELECT email INTO v_patient_email FROM auth.users WHERE id = NEW.patient_id;
    END IF;

    v_date_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'FMMonth DD, YYYY');
    v_time_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'HH12:MI AM UTC');

    -- EVENT 1: New Appointment Booking (INSERT)
    IF TG_OP = 'INSERT' AND NEW.status IN ('HELD', 'CONFIRMED') AND v_patient_email IS NOT NULL THEN
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
            timezone('utc'::text, now())
        )
        ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;

        -- 2. 24-Hour Reminder Email Job (Scheduled)
        IF NEW.start_time > (timezone('utc'::text, now()) + INTERVAL '24 hours') THEN
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
        IF NEW.start_time > (timezone('utc'::text, now()) + INTERVAL '2 hours') THEN
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

    -- EVENT 2: Appointment Status Update or Reschedule
    IF TG_OP = 'UPDATE' THEN
        -- Case A: Appointment Cancelled
        IF OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
            -- Cancel all pending reminder jobs
            UPDATE public.email_jobs
            SET status = 'CANCELLED',
                updated_at = timezone('utc'::text, now())
            WHERE appointment_id = NEW.id AND status IN ('PENDING', 'RETRY');

            -- Queue cancellation email
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
                    timezone('utc'::text, now())
                )
                ON CONFLICT (appointment_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;
        END IF;

        -- Case B: Appointment Rescheduled (start_time changed)
        IF OLD.start_time <> NEW.start_time AND NEW.status IN ('HELD', 'CONFIRMED') THEN
            -- Update 24H reminder scheduled time and payload
            UPDATE public.email_jobs
            SET next_retry_at = NEW.start_time - INTERVAL '24 hours',
                payload = jsonb_set(
                    jsonb_set(payload, '{date_str}', to_jsonb(v_date_str)),
                    '{time_str}', to_jsonb(v_time_str)
                ),
                updated_at = timezone('utc'::text, now())
            WHERE appointment_id = NEW.id 
              AND email_type = 'APPOINTMENT_REMINDER_24H'
              AND status IN ('PENDING', 'RETRY');

            -- Update 2H reminder scheduled time and payload
            UPDATE public.email_jobs
            SET next_retry_at = NEW.start_time - INTERVAL '2 hours',
                payload = jsonb_set(
                    jsonb_set(payload, '{date_str}', to_jsonb(v_date_str)),
                    '{time_str}', to_jsonb(v_time_str)
                ),
                updated_at = timezone('utc'::text, now())
            WHERE appointment_id = NEW.id 
              AND email_type = 'APPOINTMENT_REMINDER_2H'
              AND status IN ('PENDING', 'RETRY');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_email_jobs ON public.appointments;
CREATE TRIGGER trg_appointment_email_jobs
    AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_email_jobs();
