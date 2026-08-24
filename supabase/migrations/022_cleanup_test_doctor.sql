-- ==============================================================================
-- MedSync Migration 022: Safe Targeted Cleanup of Test Doctor (Dr. Angel Priya)
-- Target Doctor UUID: d8e19e35-57d3-4722-907f-0b9019283b8d
-- File: supabase/migrations/022_cleanup_test_doctor.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_doctor_id UUID := 'd8e19e35-57d3-4722-907f-0b9019283b8d'::UUID;
BEGIN
    -- 1. Delete Email Jobs for this doctor or appointments with this doctor
    DELETE FROM public.email_jobs 
    WHERE recipient_id = v_doctor_id 
       OR appointment_id IN (SELECT id FROM public.appointments WHERE doctor_id = v_doctor_id);

    -- 2. Delete In-App Notifications for this doctor
    DELETE FROM public.notifications 
    WHERE user_id = v_doctor_id;

    -- 3. Delete Calendar Events & OAuth Tokens
    DELETE FROM public.appointment_calendar_events 
    WHERE user_id = v_doctor_id 
       OR appointment_id IN (SELECT id FROM public.appointments WHERE doctor_id = v_doctor_id);

    DELETE FROM public.user_calendar_tokens 
    WHERE user_id = v_doctor_id;

    -- 4. Delete AI Summaries
    DELETE FROM public.ai_post_visit_summaries 
    WHERE doctor_id = v_doctor_id;

    DELETE FROM public.ai_pre_visit_summaries 
    WHERE doctor_id = v_doctor_id;

    -- 5. Delete Prescriptions, Items & Medication Reminders
    DELETE FROM public.medication_reminders 
    WHERE prescription_id IN (SELECT id FROM public.prescriptions WHERE doctor_id = v_doctor_id);

    DELETE FROM public.prescription_items 
    WHERE prescription_id IN (SELECT id FROM public.prescriptions WHERE doctor_id = v_doctor_id);

    DELETE FROM public.prescriptions 
    WHERE doctor_id = v_doctor_id;

    -- 6. Delete Clinical Notes & Pre-Visit Intakes
    DELETE FROM public.consultation_notes 
    WHERE doctor_id = v_doctor_id;

    DELETE FROM public.patient_intake 
    WHERE appointment_id IN (SELECT id FROM public.appointments WHERE doctor_id = v_doctor_id);

    -- 7. Delete Slots, Working Hours & Leaves
    DELETE FROM public.appointment_slots 
    WHERE doctor_id = v_doctor_id;

    DELETE FROM public.doctor_working_hours 
    WHERE doctor_id = v_doctor_id;

    DELETE FROM public.doctor_leaves 
    WHERE doctor_id = v_doctor_id;

    -- 8. Delete Appointments with this doctor
    DELETE FROM public.appointments 
    WHERE doctor_id = v_doctor_id;

    -- 9. Delete Doctor Profile
    DELETE FROM public.doctor_profiles 
    WHERE id = v_doctor_id;

    -- 10. Delete Public Profile
    DELETE FROM public.profiles 
    WHERE id = v_doctor_id;

    -- 11. Delete Auth User (if present in auth.users)
    DELETE FROM auth.users 
    WHERE id = v_doctor_id;
END $$;

COMMIT;

-- ==============================================================================
-- POST-CLEANUP VERIFICATION QUERIES (All must return 0 rows)
-- ==============================================================================
SELECT 'profiles' AS table_name, count(*) AS count FROM public.profiles WHERE id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'doctor_profiles', count(*) FROM public.doctor_profiles WHERE id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'appointments', count(*) FROM public.appointments WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'appointment_slots', count(*) FROM public.appointment_slots WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'doctor_leaves', count(*) FROM public.doctor_leaves WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'doctor_working_hours', count(*) FROM public.doctor_working_hours WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'consultation_notes', count(*) FROM public.consultation_notes WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
UNION ALL
SELECT 'prescriptions', count(*) FROM public.prescriptions WHERE doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d';
