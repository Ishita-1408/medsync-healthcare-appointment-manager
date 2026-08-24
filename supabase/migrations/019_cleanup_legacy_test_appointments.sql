-- ==============================================================================
-- MedSync Migration 019: Clean Legacy Development Appointments
-- File: supabase/migrations/019_cleanup_legacy_test_appointments.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_legacy_test_appointments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    WITH deleted_rows AS (
        DELETE FROM public.appointments
        WHERE patient_id = '21536143-a325-49a4-80aa-50e601d7068e'
           OR doctor_id = 'd8e19e35-57d3-4722-907f-0b9019283b8d'
           OR (status = 'CANCELLED' AND patient_id <> 'b05bfc8c-fb8b-4f9c-a79c-e4184017772c')
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_count FROM deleted_rows;

    -- Also clean any disconnected test calendar tokens
    DELETE FROM public.user_calendar_tokens
    WHERE user_id = '21536143-a325-49a4-80aa-50e601d7068e'
       OR is_connected = false;

    RETURN v_deleted_count;
END;
$$;

-- Grant execution to anon and authenticated for database cleanup
GRANT EXECUTE ON FUNCTION public.cleanup_legacy_test_appointments() TO anon, authenticated;
