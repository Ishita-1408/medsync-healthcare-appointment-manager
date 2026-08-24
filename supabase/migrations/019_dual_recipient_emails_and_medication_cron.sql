-- ==============================================================================
-- MedSync Migration 019: Dual-Recipient Emails, Reminders, & Medication Cron
-- File: supabase/migrations/019_dual_recipient_emails_and_medication_cron.sql
-- ==============================================================================

-- 1. EXTEND EMAIL_JOBS TYPES AND UNIQUE CONSTRAINT
ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_email_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_email_type_check CHECK (email_type IN (
    'BOOKING_CONFIRMATION',
    'APPOINTMENT_REMINDER_24H',
    'APPOINTMENT_REMINDER_2H',
    'APPOINTMENT_CANCELLATION',
    'MEDICATION_REMINDER',
    'PRESCRIPTION_READY'
));

DROP INDEX IF EXISTS public.idx_unique_appointment_email_job;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_appointment_recipient_email_job
    ON public.email_jobs(appointment_id, recipient_id, email_type)
    WHERE (status <> 'CANCELLED');

-- 2. DUAL-RECIPIENT APPOINTMENT EMAIL TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_appointment_email_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_name TEXT;
    v_doctor_specialty TEXT;
    v_doctor_email TEXT;
    v_patient_name TEXT;
    v_patient_email TEXT;
    v_date_str TEXT;
    v_time_str TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- Fetch doctor details
    SELECT 
        trim(coalesce(p.first_name || ' ' || p.last_name, 'Doctor')),
        coalesce(dp.specialization, 'General Practitioner'),
        u.email
    INTO v_doctor_name, v_doctor_specialty, v_doctor_email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.doctor_profiles dp ON dp.id = u.id
    WHERE u.id = NEW.doctor_id;

    IF v_doctor_email IS NULL THEN
        SELECT email INTO v_doctor_email FROM auth.users WHERE id = NEW.doctor_id;
    END IF;

    -- Fetch patient details directly with auth.users priority
    SELECT 
        trim(coalesce(p.first_name || ' ' || p.last_name, 'Patient')),
        u.email
    INTO v_patient_name, v_patient_email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = NEW.patient_id;

    IF v_patient_email IS NULL THEN
        SELECT email INTO v_patient_email FROM auth.users WHERE id = NEW.patient_id;
    END IF;

    -- Formatted readable strings in UTC
    v_date_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'FMMonth DD, YYYY');
    v_time_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'HH12:MI AM UTC');

    -- =========================================================================
    -- EVENT 1: APPOINTMENT CREATED OR CONFIRMED
    -- =========================================================================
    IF (TG_OP = 'INSERT' AND NEW.status IN ('CONFIRMED', 'HELD'))
       OR (TG_OP = 'UPDATE' AND OLD.status = 'HELD' AND NEW.status = 'CONFIRMED') THEN

        -- A. Patient Booking Confirmation Job
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
                'BOOKING_CONFIRMATION',
                'Your MedSync Appointment is Confirmed — Dr. ' || v_doctor_name,
                jsonb_build_object(
                    'doctor_name', v_doctor_name,
                    'doctor_specialty', v_doctor_specialty,
                    'patient_name', v_patient_name,
                    'date_str', v_date_str,
                    'time_str', v_time_str,
                    'status', NEW.status,
                    'role', 'PATIENT'
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;

            -- Patient 24-Hour Reminder
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
                        'time_str', v_time_str,
                        'role', 'PATIENT'
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '24 hours'
                )
                ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;

            -- Patient 2-Hour Reminder
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
                        'time_str', v_time_str,
                        'role', 'PATIENT'
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '2 hours'
                )
                ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;
        END IF;

        -- B. Doctor Booking Confirmation Job
        IF v_doctor_email IS NOT NULL THEN
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
                NEW.doctor_id,
                v_doctor_email,
                'Dr. ' || v_doctor_name,
                'BOOKING_CONFIRMATION',
                'New Consultation Booked: ' || v_patient_name || ' — MedSync',
                jsonb_build_object(
                    'doctor_name', v_doctor_name,
                    'doctor_specialty', v_doctor_specialty,
                    'patient_name', v_patient_name,
                    'date_str', v_date_str,
                    'time_str', v_time_str,
                    'status', NEW.status,
                    'role', 'DOCTOR'
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;

            -- Doctor 24-Hour Reminder
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
                    NEW.doctor_id,
                    v_doctor_email,
                    'Dr. ' || v_doctor_name,
                    'APPOINTMENT_REMINDER_24H',
                    'Practice Reminder: Consultation Tomorrow with ' || v_patient_name,
                    jsonb_build_object(
                        'doctor_name', v_doctor_name,
                        'doctor_specialty', v_doctor_specialty,
                        'patient_name', v_patient_name,
                        'date_str', v_date_str,
                        'time_str', v_time_str,
                        'role', 'DOCTOR'
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '24 hours'
                )
                ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;

            -- Doctor 2-Hour Reminder
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
                    NEW.doctor_id,
                    v_doctor_email,
                    'Dr. ' || v_doctor_name,
                    'APPOINTMENT_REMINDER_2H',
                    'Practice Reminder: Consultation in 2 Hours with ' || v_patient_name,
                    jsonb_build_object(
                        'doctor_name', v_doctor_name,
                        'doctor_specialty', v_doctor_specialty,
                        'patient_name', v_patient_name,
                        'date_str', v_date_str,
                        'time_str', v_time_str,
                        'role', 'DOCTOR'
                    ),
                    'PENDING',
                    NEW.start_time - INTERVAL '2 hours'
                )
                ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;
        END IF;
    END IF;

    -- =========================================================================
    -- EVENT 2: APPOINTMENT CANCELLED (Patient AND Doctor Notifications)
    -- =========================================================================
    IF TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
        -- Cancel all pending or retrying reminder jobs for this appointment
        UPDATE public.email_jobs
        SET status = 'CANCELLED',
            updated_at = v_now
        WHERE appointment_id = NEW.id AND status IN ('PENDING', 'RETRY');

        -- A. Patient Cancellation Email
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
                    'time_str', v_time_str,
                    'role', 'PATIENT'
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
        END IF;

        -- B. Doctor Cancellation Email
        IF v_doctor_email IS NOT NULL THEN
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
                NEW.doctor_id,
                v_doctor_email,
                'Dr. ' || v_doctor_name,
                'APPOINTMENT_CANCELLATION',
                'Consultation Cancelled: ' || v_patient_name || ' — MedSync',
                jsonb_build_object(
                    'doctor_name', v_doctor_name,
                    'doctor_specialty', v_doctor_specialty,
                    'patient_name', v_patient_name,
                    'date_str', v_date_str,
                    'time_str', v_time_str,
                    'role', 'DOCTOR'
                ),
                'PENDING',
                v_now
            )
            ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
        END IF;
    END IF;

    -- =========================================================================
    -- EVENT 3: APPOINTMENT RESCHEDULED
    -- =========================================================================
    IF TG_OP = 'UPDATE' AND OLD.start_time <> NEW.start_time AND NEW.status IN ('HELD', 'CONFIRMED') THEN
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
