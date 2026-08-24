-- 1. CLEANUP RPC FUNCTION (Callable via Admin / Migration)
CREATE OR REPLACE FUNCTION public.delete_test_patient_records(
    p_test_patient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_del_appts INTEGER := 0;
    v_del_rems INTEGER := 0;
    v_del_jobs INTEGER := 0;
    v_del_notifs INTEGER := 0;
    v_del_rx INTEGER := 0;
BEGIN
    DELETE FROM public.email_jobs WHERE recipient_id = p_test_patient_id;
    GET DIAGNOSTICS v_del_jobs = ROW_COUNT;

    DELETE FROM public.notifications WHERE user_id = p_test_patient_id;
    GET DIAGNOSTICS v_del_notifs = ROW_COUNT;

    DELETE FROM public.medication_reminders WHERE patient_id = p_test_patient_id;
    GET DIAGNOSTICS v_del_rems = ROW_COUNT;

    DELETE FROM public.appointment_calendar_events WHERE user_id = p_test_patient_id;
    DELETE FROM public.user_calendar_tokens WHERE user_id = p_test_patient_id;
    DELETE FROM public.patient_intake WHERE patient_id = p_test_patient_id;
    DELETE FROM public.consultation_notes WHERE patient_id = p_test_patient_id;

    DELETE FROM public.prescription_items WHERE prescription_id IN (
        SELECT id FROM public.prescriptions WHERE patient_id = p_test_patient_id
    );
    DELETE FROM public.prescriptions WHERE patient_id = p_test_patient_id;
    GET DIAGNOSTICS v_del_rx = ROW_COUNT;

    DELETE FROM public.appointments WHERE patient_id = p_test_patient_id;
    GET DIAGNOSTICS v_del_appts = ROW_COUNT;

    DELETE FROM public.profiles WHERE id = p_test_patient_id;

    RETURN jsonb_build_object(
        'deleted_appointments', v_del_appts,
        'deleted_prescriptions', v_del_rx,
        'deleted_reminders', v_del_rems,
        'deleted_email_jobs', v_del_jobs,
        'deleted_notifications', v_del_notifs
    );
END;
$$;

-- 2. DIRECT IMMEDIATE CLEANUP OF KNOWN TEST PATIENT
DO $$
DECLARE
    v_test_patient_id UUID := '21536143-a325-49a4-80aa-50e601d7068e'::UUID;
BEGIN
    PERFORM public.delete_test_patient_records(v_test_patient_id);
END $$;
