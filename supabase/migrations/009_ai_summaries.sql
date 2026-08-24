-- ==============================================================================
-- MedSync Migration 009: AI Clinical Summaries & Triage Assistance
-- File: supabase/migrations/009_ai_summaries.sql
-- ==============================================================================

-- 1. AI PRE-VISIT SUMMARIES TABLE
CREATE TABLE IF NOT EXISTS public.ai_pre_visit_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    intake_id UUID REFERENCES public.appointment_intakes(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE CASCADE,
    urgency TEXT NOT NULL CHECK (urgency IN ('Low', 'Medium', 'High')),
    chief_complaint TEXT NOT NULL,
    suggested_questions JSONB NOT NULL DEFAULT '[]'::JSONB,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'PENDING')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_ai_pre_visit_appointment ON public.ai_pre_visit_summaries(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ai_pre_visit_patient ON public.ai_pre_visit_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_pre_visit_doctor ON public.ai_pre_visit_summaries(doctor_id);
CREATE INDEX IF NOT EXISTS idx_ai_pre_visit_urgency ON public.ai_pre_visit_summaries(urgency);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_ai_pre_visit_summaries_updated_at ON public.ai_pre_visit_summaries;
CREATE TRIGGER trg_ai_pre_visit_summaries_updated_at
    BEFORE UPDATE ON public.ai_pre_visit_summaries
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict HIPAA-compliant isolation for AI clinical insights
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_pre_visit_summaries ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Doctor can view for own appointments; Patient can view for own appointment
DROP POLICY IF EXISTS "Patients and Doctors can view AI pre-visit summaries" ON public.ai_pre_visit_summaries;
CREATE POLICY "Patients and Doctors can view AI pre-visit summaries"
    ON public.ai_pre_visit_summaries FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

-- INSERT Policy: Doctors and backend service can insert for assigned appointments
DROP POLICY IF EXISTS "Doctors can insert AI pre-visit summaries" ON public.ai_pre_visit_summaries;
CREATE POLICY "Doctors can insert AI pre-visit summaries"
    ON public.ai_pre_visit_summaries FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
    );

-- UPDATE Policy: Doctors can update AI pre-visit summaries for assigned appointments
DROP POLICY IF EXISTS "Doctors can update AI pre-visit summaries" ON public.ai_pre_visit_summaries;
CREATE POLICY "Doctors can update AI pre-visit summaries"
    ON public.ai_pre_visit_summaries FOR UPDATE
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
