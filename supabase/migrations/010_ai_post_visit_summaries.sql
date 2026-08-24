-- ==============================================================================
-- MedSync Migration 010: AI Post-Visit Patient-Friendly Care Summaries
-- File: supabase/migrations/010_ai_post_visit_summaries.sql
-- ==============================================================================

-- 1. AI POST-VISIT SUMMARIES TABLE
CREATE TABLE IF NOT EXISTS public.ai_post_visit_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL UNIQUE REFERENCES public.consultation_notes(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    diagnosis_explanation TEXT NOT NULL,
    medications JSONB NOT NULL DEFAULT '[]'::JSONB,
    follow_up JSONB NOT NULL DEFAULT '{}'::JSONB,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'PENDING')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for post-visit summaries
CREATE INDEX IF NOT EXISTS idx_ai_post_visit_appointment ON public.ai_post_visit_summaries(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ai_post_visit_consultation ON public.ai_post_visit_summaries(consultation_id);
CREATE INDEX IF NOT EXISTS idx_ai_post_visit_patient ON public.ai_post_visit_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_post_visit_doctor ON public.ai_post_visit_summaries(doctor_id);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_ai_post_visit_summaries_updated_at ON public.ai_post_visit_summaries;
CREATE TRIGGER trg_ai_post_visit_summaries_updated_at
    BEFORE UPDATE ON public.ai_post_visit_summaries
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_post_visit_summaries ENABLE ROW LEVEL SECURITY;

-- SELECT: Patient can view their own summary; Doctor can view their authored encounter summary
DROP POLICY IF EXISTS "Patients and Doctors can view AI post-visit summaries" ON public.ai_post_visit_summaries;
CREATE POLICY "Patients and Doctors can view AI post-visit summaries"
    ON public.ai_post_visit_summaries FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

-- INSERT: Doctors and backend service can insert for assigned appointments
DROP POLICY IF EXISTS "Doctors can insert AI post-visit summaries" ON public.ai_post_visit_summaries;
CREATE POLICY "Doctors can insert AI post-visit summaries"
    ON public.ai_post_visit_summaries FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
    );

-- UPDATE: Doctors and backend service can update for assigned appointments
DROP POLICY IF EXISTS "Doctors can update AI post-visit summaries" ON public.ai_post_visit_summaries;
CREATE POLICY "Doctors can update AI post-visit summaries"
    ON public.ai_post_visit_summaries FOR UPDATE
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
