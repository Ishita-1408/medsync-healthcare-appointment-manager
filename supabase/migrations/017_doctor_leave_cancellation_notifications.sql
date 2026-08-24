-- ==============================================================================
-- MedSync Migration 017: Doctor Leave Impact Handling & Patient Notification
-- File: supabase/migrations/017_doctor_leave_cancellation_notifications.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_doctor_leave_impact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_appt RECORD;
    v_doc_name TEXT;
    v_pat_name TEXT;
    v_pat_email TEXT;
    v_appt_time_str TEXT;
BEGIN
    -- Retrieve doctor name
    SELECT trim(COALESCE(p.first_name || ' ' || p.last_name, 'Physician'))
    INTO v_doc_name
    FROM public.profiles p
    WHERE p.id = NEW.doctor_id;

    -- Find all existing active appointments (CONFIRMED or HELD) overlapping the leave window
    FOR v_appt IN (
        SELECT a.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
        FROM public.appointments a
        JOIN public.profiles p ON p.id = a.patient_id
        WHERE a.doctor_id = NEW.doctor_id
          AND a.status IN ('CONFIRMED', 'HELD')
          AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
    ) LOOP
        v_pat_name := trim(COALESCE(v_appt.patient_first_name || ' ' || v_appt.patient_last_name, 'Patient'));
        v_appt_time_str := to_char(v_appt.start_time AT TIME ZONE 'UTC', 'Mon DD, YYYY at HH12:MI AM');

        -- 1. Cancel affected appointment
        UPDATE public.appointments
        SET status = 'CANCELLED',
            hold_expires_at = NULL,
            cancellation_reason = 'Doctor scheduled on leave (' || COALESCE(NEW.reason, 'Planned Leave') || ')',
            updated_at = timezone('utc'::text, now())
        WHERE id = v_appt.id;

        -- 2. Create In-App Notification for Patient
        INSERT INTO public.notifications (
            user_id,
            appointment_id,
            type,
            title,
            message,
            channel,
            status
        ) VALUES (
            v_appt.patient_id,
            v_appt.id,
            'APPOINTMENT_CANCELLED_LEAVE',
            'Consultation Cancelled: Doctor on Leave',
            'Your consultation with Dr. ' || v_doc_name || ' on ' || v_appt_time_str || ' has been cancelled because the doctor is scheduled on leave. Please select a new slot on the patient portal.',
            'IN_APP',
            'UNREAD'
        );

        -- 3. Create In-App Notification for Doctor
        INSERT INTO public.notifications (
            user_id,
            appointment_id,
            type,
            title,
            message,
            channel,
            status
        ) VALUES (
            NEW.doctor_id,
            v_appt.id,
            'APPOINTMENT_CANCELLED_LEAVE',
            'Booking Cancelled due to Leave',
            'Consultation with ' || v_pat_name || ' (' || v_appt_time_str || ') was automatically cancelled due to your scheduled leave.',
            'IN_APP',
            'UNREAD'
        );

        -- 4. Create Transactional Email Job for Patient
        SELECT email INTO v_pat_email FROM auth.users WHERE id = v_appt.patient_id;
        IF v_pat_email IS NOT NULL THEN
            INSERT INTO public.email_jobs (
                appointment_id,
                recipient_id,
                recipient_email,
                recipient_name,
                email_type,
                subject,
                payload,
                status
            ) VALUES (
                v_appt.id,
                v_appt.patient_id,
                v_pat_email,
                v_pat_name,
                'APPOINTMENT_CANCELLATION',
                'Consultation Cancelled: Doctor on Leave — MedSync',
                jsonb_build_object(
                    'doctor_name', v_doc_name,
                    'patient_name', v_pat_name,
                    'date_str', to_char(v_appt.start_time AT TIME ZONE 'UTC', 'Mon DD, YYYY'),
                    'time_str', to_char(v_appt.start_time AT TIME ZONE 'UTC', 'HH12:MI AM'),
                    'reason', 'Doctor scheduled on leave'
                ),
                'PENDING'
            );
        END IF;

        -- 5. Mark calendar event mapping as CANCELLED
        UPDATE public.appointment_calendar_events
        SET status = 'CANCELLED',
            updated_at = timezone('utc'::text, now())
        WHERE appointment_id = v_appt.id;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_doctor_leave_impact ON public.doctor_leaves;
CREATE TRIGGER trg_handle_doctor_leave_impact
    AFTER INSERT OR UPDATE ON public.doctor_leaves
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_doctor_leave_impact();
