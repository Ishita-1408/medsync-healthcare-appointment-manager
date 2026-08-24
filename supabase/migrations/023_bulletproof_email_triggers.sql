-- ==============================================================================
-- MedSync Migration 023: Bulletproof Email Trigger & Dual-Recipient Resolution
-- File: supabase/migrations/023_bulletproof_email_triggers.sql
-- ==============================================================================

-- 1. BULLETPROOF APPOINTMENT TRIGGER FUNCTION
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
    -- 1. Resolve Doctor Name, Specialty & Email with Multi-Layer Fallback
    SELECT 
        COALESCE(NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''), 'Doctor'),
        COALESCE(dp.specialization, 'General Practitioner'),
        COALESCE(u.email, p.email)
    INTO v_doctor_name, v_doctor_specialty, v_doctor_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.doctor_profiles dp ON dp.id = p.id
    WHERE p.id = NEW.doctor_id;

    IF v_doctor_email IS NULL THEN
        SELECT email INTO v_doctor_email FROM auth.users WHERE id = NEW.doctor_id;
    END IF;
    IF v_doctor_email IS NULL THEN
        SELECT email INTO v_doctor_email FROM public.profiles WHERE id = NEW.doctor_id;
    END IF;

    -- 2. Resolve Patient Name & Email with Multi-Layer Fallback
    SELECT 
        COALESCE(NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''), 'Patient'),
        COALESCE(u.email, p.email)
    INTO v_patient_name, v_patient_email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = NEW.patient_id;

    IF v_patient_email IS NULL THEN
        SELECT email INTO v_patient_email FROM auth.users WHERE id = NEW.patient_id;
    END IF;
    IF v_patient_email IS NULL THEN
        SELECT email INTO v_patient_email FROM public.profiles WHERE id = NEW.patient_id;
    END IF;

    -- 3. Formatted Date & Time Strings
    v_date_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'FMMonth DD, YYYY');
    v_time_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'HH12:MI AM UTC');

    -- =========================================================================
    -- EVENT 1: APPOINTMENT CREATED OR CONFIRMED
    -- =========================================================================
    IF (TG_OP = 'INSERT' AND NEW.status IN ('CONFIRMED', 'HELD'))
       OR (TG_OP = 'UPDATE' AND OLD.status = 'HELD' AND NEW.status = 'CONFIRMED') THEN

        -- A. Patient Confirmation Job
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
                'Your MedSync Appointment is Confirmed — ' || v_doctor_name,
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

            -- 24-Hour Patient Reminder
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
                    'Reminder: Your MedSync Appointment is Tomorrow — ' || v_doctor_name,
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

            -- 2-Hour Patient Reminder
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
                    'Urgent Reminder: Your MedSync Appointment is in 2 Hours — ' || v_doctor_name,
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

        -- B. Doctor Confirmation Job
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
                v_doctor_name,
                'BOOKING_CONFIRMATION',
                'New Consultation Scheduled: ' || v_patient_name || ' — MedSync',
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
        END IF;

    -- =========================================================================
    -- EVENT 2: APPOINTMENT RESCHEDULED
    -- =========================================================================
    ELSIF TG_OP = 'UPDATE' AND (OLD.start_time <> NEW.start_time OR OLD.end_time <> NEW.end_time) AND NEW.status = 'CONFIRMED' THEN

        -- Cancel obsolete reminder jobs
        UPDATE public.email_jobs
        SET status = 'CANCELLED',
            updated_at = v_now
        WHERE appointment_id = NEW.id
          AND email_type IN ('APPOINTMENT_REMINDER_24H', 'APPOINTMENT_REMINDER_2H')
          AND status IN ('PENDING', 'RETRY');

        -- Re-queue reminders for new timing
        IF v_patient_email IS NOT NULL THEN
            IF NEW.start_time > (v_now + INTERVAL '24 hours') THEN
                INSERT INTO public.email_jobs (
                    appointment_id, recipient_id, recipient_email, recipient_name, email_type, subject, payload, status, next_retry_at
                ) VALUES (
                    NEW.id, NEW.patient_id, v_patient_email, v_patient_name, 'APPOINTMENT_REMINDER_24H',
                    'Reminder: Your Rescheduled Appointment is Tomorrow — ' || v_doctor_name,
                    jsonb_build_object('doctor_name', v_doctor_name, 'doctor_specialty', v_doctor_specialty, 'patient_name', v_patient_name, 'date_str', v_date_str, 'time_str', v_time_str, 'role', 'PATIENT'),
                    'PENDING', NEW.start_time - INTERVAL '24 hours'
                ) ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;

            IF NEW.start_time > (v_now + INTERVAL '2 hours') THEN
                INSERT INTO public.email_jobs (
                    appointment_id, recipient_id, recipient_email, recipient_name, email_type, subject, payload, status, next_retry_at
                ) VALUES (
                    NEW.id, NEW.patient_id, v_patient_email, v_patient_name, 'APPOINTMENT_REMINDER_2H',
                    'Urgent Reminder: Your Rescheduled Appointment is in 2 Hours — ' || v_doctor_name,
                    jsonb_build_object('doctor_name', v_doctor_name, 'doctor_specialty', v_doctor_specialty, 'patient_name', v_patient_name, 'date_str', v_date_str, 'time_str', v_time_str, 'role', 'PATIENT'),
                    'PENDING', NEW.start_time - INTERVAL '2 hours'
                ) ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
            END IF;
        END IF;

    -- =========================================================================
    -- EVENT 3: APPOINTMENT CANCELLED
    -- =========================================================================
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN

        -- Cancel pending reminder jobs
        UPDATE public.email_jobs
        SET status = 'CANCELLED',
            updated_at = v_now
        WHERE appointment_id = NEW.id
          AND status IN ('PENDING', 'RETRY');

        -- Patient Cancellation Notice
        IF v_patient_email IS NOT NULL THEN
            INSERT INTO public.email_jobs (
                appointment_id, recipient_id, recipient_email, recipient_name, email_type, subject, payload, status, next_retry_at
            ) VALUES (
                NEW.id, NEW.patient_id, v_patient_email, v_patient_name, 'APPOINTMENT_CANCELLATION',
                'Appointment Cancelled — ' || v_doctor_name,
                jsonb_build_object('doctor_name', v_doctor_name, 'doctor_specialty', v_doctor_specialty, 'patient_name', v_patient_name, 'date_str', v_date_str, 'time_str', v_time_str, 'role', 'PATIENT'),
                'PENDING', v_now
            ) ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
        END IF;

        -- Doctor Cancellation Notice
        IF v_doctor_email IS NOT NULL THEN
            INSERT INTO public.email_jobs (
                appointment_id, recipient_id, recipient_email, recipient_name, email_type, subject, payload, status, next_retry_at
            ) VALUES (
                NEW.id, NEW.doctor_id, v_doctor_email, v_doctor_name, 'APPOINTMENT_CANCELLATION',
                'Consultation Cancelled: ' || v_patient_name,
                jsonb_build_object('doctor_name', v_doctor_name, 'doctor_specialty', v_doctor_specialty, 'patient_name', v_patient_name, 'date_str', v_date_str, 'time_str', v_time_str, 'role', 'DOCTOR'),
                'PENDING', v_now
            ) ON CONFLICT (appointment_id, recipient_id, email_type) WHERE (status <> 'CANCELLED') DO NOTHING;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- 2. REATTACH APPOINTMENT TRIGGER
DROP TRIGGER IF EXISTS trg_appointment_email_jobs ON public.appointments;
CREATE TRIGGER trg_appointment_email_jobs
    AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_email_jobs();
