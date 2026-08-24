-- ==============================================================================
-- MedSync Migration 008: Notifications & Appointment Reminders Architecture
-- File: supabase/migrations/008_notifications.sql
-- ==============================================================================

-- 1. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'APPOINTMENT_BOOKED',
        'APPOINTMENT_CONFIRMED',
        'APPOINTMENT_CANCELLED',
        'APPOINTMENT_REMINDER_24H',
        'APPOINTMENT_REMINDER_2H',
        'INTAKE_REMINDER',
        'PRESCRIPTION_ISSUED',
        'FOLLOW_UP_REMINDER'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS')),
    status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ', 'CANCELLED')),
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance & deduplication
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON public.notifications(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Deduplication: Strict unique index preventing duplicate notifications per user, appointment and type
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_appointment_notification 
    ON public.notifications(user_id, appointment_id, type) 
    WHERE (appointment_id IS NOT NULL);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict user isolation: users can only see and mark their own notifications as read
-- ------------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- UPDATE: Users can only update their own notifications (e.g. mark as READ)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. AUTOMATED DATABASE EVENT TRIGGERS
-- Generates notifications at the database level when actions commit successfully
-- ------------------------------------------------------------------------------

-- Helper function to safely insert a notification with deduplication
CREATE OR REPLACE FUNCTION public.create_notification_safe(
    p_user_id UUID,
    p_appointment_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_channel TEXT DEFAULT 'IN_APP',
    p_status TEXT DEFAULT 'SENT',
    p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_notif_id UUID;
    v_sent_at TIMESTAMPTZ;
BEGIN
    IF p_status = 'SENT' THEN
        v_sent_at := timezone('utc'::text, now());
    ELSE
        v_sent_at := NULL;
    END IF;

    INSERT INTO public.notifications (
        user_id,
        appointment_id,
        type,
        title,
        message,
        channel,
        status,
        scheduled_for,
        sent_at
    )
    VALUES (
        p_user_id,
        p_appointment_id,
        p_type,
        p_title,
        p_message,
        p_channel,
        p_status,
        p_scheduled_for,
        v_sent_at
    )
    ON CONFLICT (user_id, appointment_id, type) WHERE (appointment_id IS NOT NULL) DO NOTHING
    RETURNING id INTO v_notif_id;

    RETURN v_notif_id;
END;
$$;

-- TRIGGER FUNCTION: Handle appointment lifecycle events
CREATE OR REPLACE FUNCTION public.handle_appointment_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_name TEXT;
    v_patient_name TEXT;
    v_appt_time_str TEXT;
BEGIN
    -- Fetch doctor name
    SELECT coalesce(p.first_name || ' ' || p.last_name, 'Doctor')
    INTO v_doctor_name
    FROM public.profiles p
    WHERE p.id = NEW.doctor_id;

    -- Fetch patient name
    SELECT coalesce(p.first_name || ' ' || p.last_name, 'Patient')
    INTO v_patient_name
    FROM public.profiles p
    WHERE p.id = NEW.patient_id;

    v_appt_time_str := to_char(NEW.start_time AT TIME ZONE 'UTC', 'Mon DD, YYYY at HH12:MI AM UTC');

    -- EVENT 1: New Appointment Booking (INSERT)
    IF TG_OP = 'INSERT' AND NEW.status IN ('HELD', 'CONFIRMED') THEN
        -- Patient Notification
        PERFORM public.create_notification_safe(
            NEW.patient_id,
            NEW.id,
            'APPOINTMENT_BOOKED',
            'Appointment Booked',
            'Your consultation with Dr. ' || v_doctor_name || ' is scheduled for ' || v_appt_time_str || '.',
            'IN_APP',
            'SENT'
        );

        -- Doctor Notification
        PERFORM public.create_notification_safe(
            NEW.doctor_id,
            NEW.id,
            'APPOINTMENT_BOOKED',
            'New Patient Scheduled',
            'Patient ' || v_patient_name || ' has scheduled a consultation for ' || v_appt_time_str || '.',
            'IN_APP',
            'SENT'
        );

        -- 24-Hour Reminder (scheduled)
        IF NEW.start_time > (timezone('utc'::text, now()) + INTERVAL '24 hours') THEN
            PERFORM public.create_notification_safe(
                NEW.patient_id,
                NEW.id,
                'APPOINTMENT_REMINDER_24H',
                'Upcoming Consultation Reminder (24h)',
                'Reminder: You have an appointment with Dr. ' || v_doctor_name || ' tomorrow at ' || v_appt_time_str || '.',
                'IN_APP',
                'PENDING',
                NEW.start_time - INTERVAL '24 hours'
            );
        END IF;

        -- 2-Hour Reminder (scheduled)
        IF NEW.start_time > (timezone('utc'::text, now()) + INTERVAL '2 hours') THEN
            PERFORM public.create_notification_safe(
                NEW.patient_id,
                NEW.id,
                'APPOINTMENT_REMINDER_2H',
                'Upcoming Consultation Reminder (2h)',
                'Your consultation with Dr. ' || v_doctor_name || ' starts in 2 hours (' || v_appt_time_str || ').',
                'IN_APP',
                'PENDING',
                NEW.start_time - INTERVAL '2 hours'
            );
        END IF;

        -- Intake Reminder (scheduled for 1 hour after booking if in advance)
        PERFORM public.create_notification_safe(
            NEW.patient_id,
            NEW.id,
            'INTAKE_REMINDER',
            'Complete Pre-Visit Intake',
            'Please complete your pre-visit symptom intake before your visit with Dr. ' || v_doctor_name || '.',
            'IN_APP',
            'SENT'
        );
    END IF;

    -- EVENT 2: Appointment Status Update
    IF TG_OP = 'UPDATE' THEN
        -- Status changed to CANCELLED
        IF OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
            -- Cancel all pending future reminders for this appointment
            UPDATE public.notifications
            SET status = 'CANCELLED',
                updated_at = timezone('utc'::text, now())
            WHERE appointment_id = NEW.id AND status = 'PENDING';

            -- Patient Notification
            PERFORM public.create_notification_safe(
                NEW.patient_id,
                NEW.id,
                'APPOINTMENT_CANCELLED',
                'Appointment Cancelled',
                'Your consultation with Dr. ' || v_doctor_name || ' scheduled for ' || v_appt_time_str || ' has been cancelled.',
                'IN_APP',
                'SENT'
            );

            -- Doctor Notification
            PERFORM public.create_notification_safe(
                NEW.doctor_id,
                NEW.id,
                'APPOINTMENT_CANCELLED',
                'Appointment Cancelled',
                'The consultation with ' || v_patient_name || ' scheduled for ' || v_appt_time_str || ' has been cancelled.',
                'IN_APP',
                'SENT'
            );
        END IF;

        -- Status changed to CONFIRMED from HELD
        IF OLD.status = 'HELD' AND NEW.status = 'CONFIRMED' THEN
            PERFORM public.create_notification_safe(
                NEW.patient_id,
                NEW.id,
                'APPOINTMENT_CONFIRMED',
                'Appointment Confirmed',
                'Your appointment with Dr. ' || v_doctor_name || ' on ' || v_appt_time_str || ' is now confirmed.',
                'IN_APP',
                'SENT'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_notifications ON public.appointments;
CREATE TRIGGER trg_appointment_notifications
    AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_notification_events();

-- TRIGGER FUNCTION: Handle prescription finalization
CREATE OR REPLACE FUNCTION public.handle_prescription_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_name TEXT;
BEGIN
    IF NEW.status = 'FINALIZED' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'FINALIZED')) THEN
        SELECT coalesce(p.first_name || ' ' || p.last_name, 'Physician')
        INTO v_doctor_name
        FROM public.profiles p
        WHERE p.id = NEW.doctor_id;

        PERFORM public.create_notification_safe(
            NEW.patient_id,
            NEW.appointment_id,
            'PRESCRIPTION_ISSUED',
            'Digital Prescription Issued (Rx)',
            'Dr. ' || v_doctor_name || ' has issued your official digital medical prescription. You can review and print it in your portal.',
            'IN_APP',
            'SENT'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prescription_notifications ON public.prescriptions;
CREATE TRIGGER trg_prescription_notifications
    AFTER INSERT OR UPDATE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_prescription_notification_events();

-- TRIGGER FUNCTION: Handle follow-up date in consultation notes
CREATE OR REPLACE FUNCTION public.handle_consultation_follow_up_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_name TEXT;
    v_follow_up_str TEXT;
BEGIN
    IF NEW.follow_up_date IS NOT NULL AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.follow_up_date IS NULL OR OLD.follow_up_date <> NEW.follow_up_date))) THEN
        SELECT coalesce(p.first_name || ' ' || p.last_name, 'Physician')
        INTO v_doctor_name
        FROM public.profiles p
        WHERE p.id = NEW.doctor_id;

        v_follow_up_str := to_char(NEW.follow_up_date, 'Mon DD, YYYY');

        PERFORM public.create_notification_safe(
            NEW.patient_id,
            NEW.appointment_id,
            'FOLLOW_UP_REMINDER',
            'Recommended Follow-Up Consultation',
            'Dr. ' || v_doctor_name || ' has recommended a follow-up consultation on or around ' || v_follow_up_str || '.',
            'IN_APP',
            'SENT'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultation_follow_up_notifications ON public.consultation_notes;
CREATE TRIGGER trg_consultation_follow_up_notifications
    AFTER INSERT OR UPDATE ON public.consultation_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_consultation_follow_up_notifications();

-- ------------------------------------------------------------------------------
-- 4. SCHEDULED REMINDER WORKER RPC
-- Sweeps pending reminder notifications that have reached their scheduled time
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_scheduled_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_processed_count INTEGER := 0;
BEGIN
    WITH activated AS (
        UPDATE public.notifications
        SET status = 'SENT',
            sent_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE status = 'PENDING'
          AND scheduled_for IS NOT NULL
          AND scheduled_for <= timezone('utc'::text, now())
        RETURNING id
    )
    SELECT count(*) INTO v_processed_count FROM activated;

    RETURN v_processed_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. NOTIFICATION READ STATUS RPCs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE public.notifications
    SET status = 'READ',
        read_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_notification_id AND user_id = auth.uid();

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    WITH updated_rows AS (
        UPDATE public.notifications
        SET status = 'READ',
            read_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE user_id = auth.uid() AND status <> 'READ'
        RETURNING id
    )
    SELECT count(*) INTO v_updated FROM updated_rows;

    RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC EXECUTION GRANTS
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.process_scheduled_reminders() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_reminders_for_prescription(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;
