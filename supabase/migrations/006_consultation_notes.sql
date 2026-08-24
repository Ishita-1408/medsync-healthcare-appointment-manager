-- ==============================================================================
-- MedSync Migration 006: Doctor Consultation Workflow & Clinical Notes
-- File: supabase/migrations/006_consultation_notes.sql
-- ==============================================================================

-- 1. CREATE CONSULTATION_NOTES TABLE
CREATE TABLE IF NOT EXISTS public.consultation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    chief_complaint TEXT,
    examination_notes TEXT,
    diagnosis TEXT NOT NULL,
    treatment_plan TEXT NOT NULL,
    doctor_notes TEXT,
    follow_up_instructions TEXT,
    follow_up_date DATE,
    is_finalized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_consultation_notes_appt ON public.consultation_notes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_consultation_notes_doctor ON public.consultation_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultation_notes_patient ON public.consultation_notes(patient_id);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_consultation_notes_updated_at ON public.consultation_notes;
CREATE TRIGGER trg_consultation_notes_updated_at
    BEFORE UPDATE ON public.consultation_notes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict HIPAA-aligned access: only the treating doctor & patient can access
-- ------------------------------------------------------------------------------
ALTER TABLE public.consultation_notes ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Doctor can view their own consultations; Patient can view their own consultation notes
DROP POLICY IF EXISTS "Patients and Doctors can view consultation notes" ON public.consultation_notes;
CREATE POLICY "Patients and Doctors can view consultation notes"
    ON public.consultation_notes FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

-- INSERT Policy: Doctors can insert consultation notes ONLY for appointments assigned to them
DROP POLICY IF EXISTS "Doctors can create consultation notes for their appointments" ON public.consultation_notes;
CREATE POLICY "Doctors can create consultation notes for their appointments"
    ON public.consultation_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
    );

-- UPDATE Policy: Doctors can update consultation notes ONLY for appointments assigned to them
DROP POLICY IF EXISTS "Doctors can update consultation notes for their appointments" ON public.consultation_notes;
CREATE POLICY "Doctors can update consultation notes for their appointments"
    ON public.consultation_notes FOR UPDATE
    TO authenticated
    USING (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
    )
    WITH CHECK (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 3. ATOMIC CONSULTATION FINALIZATION RPC
-- Single-transaction atomicity: saves consultation note & updates appointment status to COMPLETED
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_consultation_atomic(
    p_appointment_id UUID,
    p_diagnosis TEXT,
    p_treatment_plan TEXT,
    p_chief_complaint TEXT DEFAULT NULL,
    p_examination_notes TEXT DEFAULT NULL,
    p_doctor_notes TEXT DEFAULT NULL,
    p_follow_up_instructions TEXT DEFAULT NULL,
    p_follow_up_date DATE DEFAULT NULL,
    p_is_finalized BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_id UUID;
    v_patient_id UUID;
    v_note_id UUID;
BEGIN
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Verify appointment ownership and get patient_id
    SELECT patient_id INTO v_patient_id
    FROM public.appointments
    WHERE id = p_appointment_id AND doctor_id = v_doctor_id;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Appointment not found or not assigned to the authenticated doctor.';
    END IF;

    -- Upsert consultation note
    INSERT INTO public.consultation_notes (
        appointment_id,
        doctor_id,
        patient_id,
        chief_complaint,
        examination_notes,
        diagnosis,
        treatment_plan,
        doctor_notes,
        follow_up_instructions,
        follow_up_date,
        is_finalized
    )
    VALUES (
        p_appointment_id,
        v_doctor_id,
        v_patient_id,
        p_chief_complaint,
        p_examination_notes,
        p_diagnosis,
        p_treatment_plan,
        p_doctor_notes,
        p_follow_up_instructions,
        p_follow_up_date,
        p_is_finalized
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET chief_complaint = EXCLUDED.chief_complaint,
        examination_notes = EXCLUDED.examination_notes,
        diagnosis = EXCLUDED.diagnosis,
        treatment_plan = EXCLUDED.treatment_plan,
        doctor_notes = EXCLUDED.doctor_notes,
        follow_up_instructions = EXCLUDED.follow_up_instructions,
        follow_up_date = EXCLUDED.follow_up_date,
        is_finalized = EXCLUDED.is_finalized,
        updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_note_id;

    -- If finalizing, update appointment status to COMPLETED
    IF p_is_finalized THEN
        UPDATE public.appointments
        SET status = 'COMPLETED',
            hold_expires_at = NULL,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_appointment_id AND doctor_id = v_doctor_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'consultation_note_id', v_note_id,
        'appointment_id', p_appointment_id,
        'is_finalized', p_is_finalized,
        'status', CASE WHEN p_is_finalized THEN 'COMPLETED' ELSE 'CONFIRMED' END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error_code', SQLSTATE,
        'message', SQLERRM
    );
END;
$$;
