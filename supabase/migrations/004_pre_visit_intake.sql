-- ==============================================================================
-- MedSync Migration 004: Pre-Visit Symptom Intake & Clinical Summaries
-- File: supabase/migrations/004_pre_visit_intake.sql
-- ==============================================================================

-- 1. CREATE APPOINTMENT_INTAKES TABLE
CREATE TABLE IF NOT EXISTS public.appointment_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    chief_complaint TEXT NOT NULL,
    symptoms TEXT NOT NULL,
    symptom_onset TEXT,
    severity TEXT NOT NULL DEFAULT 'MODERATE' CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'CRITICAL')),
    progression TEXT DEFAULT 'SAME' CHECK (progression IN ('BETTER', 'WORSE', 'SAME', 'FLUCTUATING')),
    current_medications TEXT,
    allergies TEXT,
    existing_conditions TEXT,
    additional_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_appointment_intakes_appt ON public.appointment_intakes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_intakes_patient ON public.appointment_intakes(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_intakes_doctor ON public.appointment_intakes(doctor_id);

-- Automatic updated_at trigger
CREATE TRIGGER trg_appointment_intakes_updated_at
    BEFORE UPDATE ON public.appointment_intakes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.appointment_intakes ENABLE ROW LEVEL SECURITY;

-- Patients can view their own intakes; Doctors can view intakes for their appointments
DROP POLICY IF EXISTS "Patients and Doctors can view appointment intakes" ON public.appointment_intakes;
CREATE POLICY "Patients and Doctors can view appointment intakes"
    ON public.appointment_intakes FOR SELECT
    TO authenticated
    USING (patient_id = auth.uid() OR doctor_id = auth.uid());

-- Patients can create an intake only for their own appointment
DROP POLICY IF EXISTS "Patients can create intake for their own appointments" ON public.appointment_intakes;
CREATE POLICY "Patients can create intake for their own appointments"
    ON public.appointment_intakes FOR INSERT
    TO authenticated
    WITH CHECK (
        patient_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.patient_id = auth.uid()
        )
    );

-- Patients can update their own intake
DROP POLICY IF EXISTS "Patients can update their own appointment intake" ON public.appointment_intakes;
CREATE POLICY "Patients can update their own appointment intake"
    ON public.appointment_intakes FOR UPDATE
    TO authenticated
    USING (
        patient_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.patient_id = auth.uid()
        )
    )
    WITH CHECK (
        patient_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.patient_id = auth.uid()
        )
    );
