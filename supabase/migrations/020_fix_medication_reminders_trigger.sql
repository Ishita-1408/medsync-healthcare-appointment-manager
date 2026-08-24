-- ==============================================================================
-- MedSync Migration 020: Robust Dual-Trigger Medication Reminder Generator
-- File: supabase/migrations/020_fix_medication_reminders_trigger.sql
-- ==============================================================================

-- 1. UNIQUE INDEX TO PREVENT DUPLICATES
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_medication_reminder_item_time
    ON public.medication_reminders(prescription_item_id, reminder_time);

-- 2. DEDICATED GENERATOR FUNCTION PER PRESCRIPTION ITEM
CREATE OR REPLACE FUNCTION public.generate_reminders_for_prescription_item(
    p_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_item RECORD;
    v_rx RECORD;
    v_days INTEGER := 7;
    v_freq_lower TEXT;
    v_end_date DATE;
    v_start_date DATE;
BEGIN
    SELECT * INTO v_item FROM public.prescription_items WHERE id = p_item_id;
    IF v_item IS NULL THEN RETURN; END IF;

    SELECT * INTO v_rx FROM public.prescriptions WHERE id = v_item.prescription_id;
    IF v_rx IS NULL OR v_rx.status <> 'FINALIZED' THEN RETURN; END IF;

    -- Parse duration (default 7 days if unparseable)
    BEGIN
        v_days := COALESCE(NULLIF(regexp_replace(v_item.duration, '[^0-9]', '', 'g'), '')::INTEGER, 7);
        IF v_days <= 0 THEN v_days := 7; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_days := 7;
    END;

    v_start_date := COALESCE(v_rx.issued_at::DATE, CURRENT_DATE);
    v_end_date := v_start_date + (v_days || ' days')::INTERVAL;
    v_freq_lower := lower(v_item.frequency);

    -- 1. Morning schedule (08:00 AM)
    -- Matches: Once daily, Twice daily, Three times daily, Four times daily, Every 8 hours, Every 6 hours, BID, TID, QID, Morning, Daily
    IF v_freq_lower LIKE '%once%' 
       OR v_freq_lower LIKE '%twice%' 
       OR v_freq_lower LIKE '%three%' 
       OR v_freq_lower LIKE '%four%' 
       OR v_freq_lower LIKE '%morning%' 
       OR v_freq_lower LIKE '%bid%' 
       OR v_freq_lower LIKE '%tid%' 
       OR v_freq_lower LIKE '%qid%' 
       OR v_freq_lower LIKE '%daily%' 
       OR v_freq_lower LIKE '%8 hour%' 
       OR v_freq_lower LIKE '%6 hour%' THEN
        INSERT INTO public.medication_reminders (
            prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions, is_active
        ) VALUES (
            v_item.id, v_rx.id, v_rx.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '08:00:00'::TIME, v_start_date, v_end_date, v_item.instructions, true
        )
        ON CONFLICT (prescription_item_id, reminder_time) 
        DO UPDATE SET 
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            dosage = EXCLUDED.dosage,
            instructions = EXCLUDED.instructions,
            is_active = true,
            updated_at = timezone('utc'::text, now());
    END IF;

    -- 2. Afternoon schedule (02:00 PM / 14:00)
    -- Matches: Three times daily, Four times daily, Every 8 hours, Every 6 hours, TID, QID, Afternoon
    IF v_freq_lower LIKE '%three%' 
       OR v_freq_lower LIKE '%four%' 
       OR v_freq_lower LIKE '%tid%' 
       OR v_freq_lower LIKE '%qid%' 
       OR v_freq_lower LIKE '%afternoon%' 
       OR v_freq_lower LIKE '%8 hour%' 
       OR v_freq_lower LIKE '%6 hour%' THEN
        INSERT INTO public.medication_reminders (
            prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions, is_active
        ) VALUES (
            v_item.id, v_rx.id, v_rx.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '14:00:00'::TIME, v_start_date, v_end_date, v_item.instructions, true
        )
        ON CONFLICT (prescription_item_id, reminder_time) 
        DO UPDATE SET 
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            dosage = EXCLUDED.dosage,
            instructions = EXCLUDED.instructions,
            is_active = true,
            updated_at = timezone('utc'::text, now());
    END IF;

    -- 3. Evening/Night schedule (08:00 PM / 20:00)
    -- Matches: Twice daily, Three times daily, Four times daily, Every 8 hours, Every 6 hours, BID, TID, QID, Night, Bedtime, Evening
    IF v_freq_lower LIKE '%twice%' 
       OR v_freq_lower LIKE '%three%' 
       OR v_freq_lower LIKE '%four%' 
       OR v_freq_lower LIKE '%night%' 
       OR v_freq_lower LIKE '%bedtime%' 
       OR v_freq_lower LIKE '%evening%' 
       OR v_freq_lower LIKE '%bid%' 
       OR v_freq_lower LIKE '%tid%' 
       OR v_freq_lower LIKE '%qid%' 
       OR v_freq_lower LIKE '%8 hour%' 
       OR v_freq_lower LIKE '%6 hour%' THEN
        INSERT INTO public.medication_reminders (
            prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions, is_active
        ) VALUES (
            v_item.id, v_rx.id, v_rx.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '20:00:00'::TIME, v_start_date, v_end_date, v_item.instructions, true
        )
        ON CONFLICT (prescription_item_id, reminder_time) 
        DO UPDATE SET 
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            dosage = EXCLUDED.dosage,
            instructions = EXCLUDED.instructions,
            is_active = true,
            updated_at = timezone('utc'::text, now());
    END IF;

    -- 4. Late Night schedule (10:00 PM / 22:00)
    -- Matches: Four times daily (QID) or Every 6 hours
    IF v_freq_lower LIKE '%four%' OR v_freq_lower LIKE '%qid%' OR v_freq_lower LIKE '%6 hour%' THEN
        INSERT INTO public.medication_reminders (
            prescription_item_id, prescription_id, patient_id, medication_name, dosage, frequency, reminder_time, start_date, end_date, instructions, is_active
        ) VALUES (
            v_item.id, v_rx.id, v_rx.patient_id, v_item.medication_name, v_item.dosage, v_item.frequency, '22:00:00'::TIME, v_start_date, v_end_date, v_item.instructions, true
        )
        ON CONFLICT (prescription_item_id, reminder_time) 
        DO UPDATE SET 
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            dosage = EXCLUDED.dosage,
            instructions = EXCLUDED.instructions,
            is_active = true,
            updated_at = timezone('utc'::text, now());
    END IF;
END;
$$;

-- 3. TRIGGER FUNCTION ON PRESCRIPTION ITEMS (Runs when items are inserted/updated)
CREATE OR REPLACE FUNCTION public.handle_prescription_item_reminder_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    PERFORM public.generate_reminders_for_prescription_item(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prescription_item_medication_reminders ON public.prescription_items;
CREATE TRIGGER trg_prescription_item_medication_reminders
    AFTER INSERT OR UPDATE ON public.prescription_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_prescription_item_reminder_generation();

-- 4. TRIGGER FUNCTION ON PRESCRIPTIONS (Runs when status changes to FINALIZED)
CREATE OR REPLACE FUNCTION public.generate_medication_reminders_on_finalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'FINALIZED' THEN
        FOR v_item IN (
            SELECT id FROM public.prescription_items
            WHERE prescription_id = NEW.id
        ) LOOP
            PERFORM public.generate_reminders_for_prescription_item(v_item.id);
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

-- 5. RPC FUNCTION TO GENERATE REMINDERS FOR ALL ITEMS OF A PRESCRIPTION
CREATE OR REPLACE FUNCTION public.generate_reminders_for_prescription(
    p_prescription_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_item RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_item IN (
        SELECT id FROM public.prescription_items
        WHERE prescription_id = p_prescription_id
    ) LOOP
        PERFORM public.generate_reminders_for_prescription_item(v_item.id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- 6. BACKFILL ALL EXISTING FINALIZED PRESCRIPTIONS
DO $$
DECLARE
    v_rx RECORD;
BEGIN
    FOR v_rx IN (SELECT id FROM public.prescriptions WHERE status = 'FINALIZED') LOOP
        PERFORM public.generate_reminders_for_prescription(v_rx.id);
    END LOOP;
END $$;

-- 7. ENHANCED DISPATCH DUE MEDICATION REMINDERS
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
        LEFT JOIN public.profiles p ON p.id = r.patient_id
        WHERE r.is_active = true
          AND CURRENT_DATE BETWEEN r.start_date AND r.end_date
          AND (r.last_sent_at IS NULL OR r.last_sent_at < timezone('utc'::text, now()) - INTERVAL '4 hours')
    ) LOOP
        v_pat_name := COALESCE(NULLIF(trim(COALESCE(v_rem.first_name, '') || ' ' || COALESCE(v_rem.last_name, '')), ''), 'Patient');

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
                    'patient_name', v_pat_name,
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

-- 8. PG_CRON SCHEDULE CONFIGURATION
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('medsync-dispatch-due-medication-reminders');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        PERFORM cron.schedule(
            'medsync-dispatch-due-medication-reminders',
            '* * * * *',
            'SELECT public.dispatch_due_medication_reminders();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
