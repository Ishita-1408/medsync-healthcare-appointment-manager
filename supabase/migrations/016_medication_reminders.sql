-- ==============================================================================
-- MedSync Migration 016: Automated Medication Reminders System
-- File: supabase/migrations/016_medication_reminders.sql
-- ==============================================================================

-- 1. MEDICATION_REMINDERS TABLE
CREATE TABLE IF NOT EXISTS public.medication_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_item_id UUID NOT NULL REFERENCES public.prescription_items(id) ON DELETE CASCADE,
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT NOT NULL,
    reminder_time TIME NOT NULL, -- e.g. 08:00:00, 14:00:00, 20:00:00
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own medication reminders" ON public.medication_reminders;
CREATE POLICY "Patients can view own medication reminders"
    ON public.medication_reminders FOR SELECT
    TO authenticated
    USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can update own medication reminders" ON public.medication_reminders;
CREATE POLICY "Patients can update own medication reminders"
    ON public.medication_reminders FOR UPDATE
    TO authenticated
    USING (patient_id = auth.uid())
    WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Backend service can manage medication reminders" ON public.medication_reminders;
CREATE POLICY "Backend service can manage medication reminders"
    ON public.medication_reminders FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. AUTOMATIC REMINDER GENERATOR TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.generate_medication_reminders_on_finalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_item RECORD;
    v_days INTEGER := 7;
    v_freq_lower TEXT;
    v_end_date DATE;
BEGIN
    -- Only trigger when prescription transitions to FINALIZED
    IF NEW.status = 'FINALIZED' AND (OLD.status IS NULL OR OLD.status <> 'FINALIZED') THEN
        FOR v_item IN (
            SELECT * FROM public.prescription_items
            WHERE prescription_id = NEW.id
        ) LOOP
            -- Parse duration (default 7 days if unparseable)
            BEGIN
                v_days := COALESCE(NULLIF(regexp_replace(v_item.duration, '[^0-9]', '', 'g'), '')::INTEGER, 7);
                IF v_days <= 0 THEN v_days := 7; END IF;
            EXCEPTION WHEN OTHERS THEN
                v_days := 7;
            END;
            v_end_date := CURRENT_DATE + (v_days || ' days')::INTERVAL;

            v_freq_lower := lower(v_item.frequency);

            -- Morning schedule (08:00 AM)
            IF v_freq_lower LIKE '%once%' OR v_freq_lower LIKE '%twice%' OR v_freq_lower LIKE '%three%' OR v_freq_lower LIKE '%four%' OR v_freq_lower LIKE '%morning%' OR v_freq_lower LIKE '%bid%' OR v_freq_lower LIKE '%tid%' OR v_freq_lower LIKE '%qid%' OR v_freq_lower LIKE '%daily%' THEN
                INSERT INTO public.medication_reminders (
                    prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions
                ) VALUES (
                    v_item.id, NEW.id, NEW.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '08:00:00'::TIME, CURRENT_DATE, v_end_date, v_item.instructions
                );
            END IF;

            -- Afternoon schedule (02:00 PM)
            IF v_freq_lower LIKE '%three%' OR v_freq_lower LIKE '%four%' OR v_freq_lower LIKE '%tid%' OR v_freq_lower LIKE '%qid%' OR v_freq_lower LIKE '%afternoon%' OR v_freq_lower LIKE '%8 hours%' THEN
                INSERT INTO public.medication_reminders (
                    prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions
                ) VALUES (
                    v_item.id, NEW.id, NEW.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '14:00:00'::TIME, CURRENT_DATE, v_end_date, v_item.instructions
                );
            END IF;

            -- Evening/Night schedule (08:00 PM)
            IF v_freq_lower LIKE '%twice%' OR v_freq_lower LIKE '%three%' OR v_freq_lower LIKE '%four%' OR v_freq_lower LIKE '%night%' OR v_freq_lower LIKE '%bedtime%' OR v_freq_lower LIKE '%bid%' OR v_freq_lower LIKE '%tid%' OR v_freq_lower LIKE '%qid%' THEN
                INSERT INTO public.medication_reminders (
                    prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions
                ) VALUES (
                    v_item.id, NEW.id, NEW.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '20:00:00'::TIME, CURRENT_DATE, v_end_date, v_item.instructions
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_medication_reminders ON public.prescriptions;
CREATE TRIGGER trg_generate_medication_reminders
    AFTER INSERT OR UPDATE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_medication_reminders_on_finalization();

-- 3. DISPATCH DUE MEDICATION REMINDERS RPC
CREATE OR REPLACE FUNCTION public.dispatch_due_medication_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_rem RECORD;
    v_count INTEGER := 0;
    v_pat_name TEXT;
    v_pat_email TEXT;
BEGIN
    FOR v_rem IN (
        SELECT r.*, p.first_name, p.last_name
        FROM public.medication_reminders r
        JOIN public.profiles p ON p.id = r.patient_id
        WHERE r.is_active = true
          AND CURRENT_DATE BETWEEN r.start_date AND r.end_date
          AND (r.last_sent_at IS NULL OR r.last_sent_at < timezone('utc'::text, now()) - INTERVAL '6 hours')
    ) LOOP
        v_pat_name := COALESCE(v_rem.first_name || ' ' || v_rem.last_name, 'Patient');

        -- 1. Create In-App Notification
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            channel,
            status
        ) VALUES (
            v_rem.patient_id,
            'MEDICATION_REMINDER',
            'Medication Reminder: ' || v_rem.medication_name,
            'Time to take your medication: ' || v_rem.medication_name || ' (' || COALESCE(v_rem.dosage, 'as prescribed') || '). ' || COALESCE(v_rem.instructions, ''),
            'IN_APP',
            'UNREAD'
        );

        -- 2. Create Email Job
        SELECT email INTO v_pat_email FROM auth.users WHERE id = v_rem.patient_id;
        IF v_pat_email IS NOT NULL THEN
            INSERT INTO public.email_jobs (
                recipient_id,
                recipient_email,
                recipient_name,
                email_type,
                subject,
                payload,
                status
            ) VALUES (
                v_rem.patient_id,
                v_pat_email,
                v_pat_name,
                'MEDICATION_REMINDER',
                'Medication Reminder: ' || v_rem.medication_name,
                jsonb_build_object(
                    'medication_name', v_rem.medication_name,
                    'dosage', v_rem.dosage,
                    'frequency', v_rem.frequency,
                    'instructions', v_rem.instructions
                ),
                'PENDING'
            );
        END IF;

        -- Update last_sent_at timestamp
        UPDATE public.medication_reminders
        SET last_sent_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_rem.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
