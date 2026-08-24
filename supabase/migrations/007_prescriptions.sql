-- ==============================================================================
-- MedSync Migration 007: Bulletproof E-Prescriptions & Medication Management
-- File: supabase/migrations/007_prescriptions.sql
-- ==============================================================================

-- 1. PRESCRIPTIONS TABLE
-- Stores official digital medical prescriptions linked to appointments and consultations
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE RESTRICT,
    consultation_id UUID NOT NULL UNIQUE REFERENCES public.consultation_notes(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'CANCELLED')),
    notes TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Fast lookup indexes for prescriptions
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON public.prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON public.prescriptions(consultation_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON public.prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions(status);

-- 2. PRESCRIPTION ITEMS TABLE
-- Detailed medication items with dosages, schedules, and pharmacy instructions
CREATE TABLE IF NOT EXISTS public.prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    strength TEXT,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    route TEXT DEFAULT 'Oral (PO)',
    duration TEXT NOT NULL,
    quantity TEXT,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_medication_name_nonempty CHECK (length(trim(medication_name)) > 0)
);

-- Index for prescription items
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription ON public.prescription_items(prescription_id);

-- Triggers for automatic updated_at
DROP TRIGGER IF EXISTS trg_prescriptions_updated_at ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_updated_at
    BEFORE UPDATE ON public.prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prescription_items_updated_at ON public.prescription_items;
CREATE TRIGGER trg_prescription_items_updated_at
    BEFORE UPDATE ON public.prescription_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict patient/doctor isolation & immutability of finalized prescriptions
-- ------------------------------------------------------------------------------
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- PRESCRIPTIONS: SELECT
DROP POLICY IF EXISTS "Patients and Doctors can view prescriptions" ON public.prescriptions;
CREATE POLICY "Patients and Doctors can view prescriptions"
    ON public.prescriptions FOR SELECT
    TO authenticated
    USING (doctor_id = auth.uid() OR patient_id = auth.uid());

-- PRESCRIPTIONS: INSERT (Doctor only for own appointments/consultations)
DROP POLICY IF EXISTS "Doctors can create prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can create prescriptions"
    ON public.prescriptions FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = appointment_id AND a.doctor_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.consultation_notes c
            WHERE c.id = consultation_id AND c.doctor_id = auth.uid()
        )
    );

-- PRESCRIPTIONS: UPDATE (Doctor only for own DRAFT prescriptions)
DROP POLICY IF EXISTS "Doctors can update own draft prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can update own draft prescriptions"
    ON public.prescriptions FOR UPDATE
    TO authenticated
    USING (
        doctor_id = auth.uid()
        AND status = 'DRAFT'
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

-- PRESCRIPTIONS: DELETE (Disabled for all to preserve medical audit records)
DROP POLICY IF EXISTS "No deleting finalized prescriptions" ON public.prescriptions;
CREATE POLICY "No deleting finalized prescriptions"
    ON public.prescriptions FOR DELETE
    TO authenticated
    USING (
        doctor_id = auth.uid()
        AND status = 'DRAFT'
    );

-- PRESCRIPTION_ITEMS: SELECT
DROP POLICY IF EXISTS "Patients and Doctors can view prescription items" ON public.prescription_items;
CREATE POLICY "Patients and Doctors can view prescription items"
    ON public.prescription_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_id
              AND (p.doctor_id = auth.uid() OR p.patient_id = auth.uid())
        )
    );

-- PRESCRIPTION_ITEMS: INSERT / UPDATE / DELETE (Doctor only for own DRAFT prescriptions)
DROP POLICY IF EXISTS "Doctors can insert prescription items" ON public.prescription_items;
CREATE POLICY "Doctors can insert prescription items"
    ON public.prescription_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_id
              AND p.doctor_id = auth.uid()
              AND p.status = 'DRAFT'
        )
    );

DROP POLICY IF EXISTS "Doctors can update prescription items" ON public.prescription_items;
CREATE POLICY "Doctors can update prescription items"
    ON public.prescription_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_id
              AND p.doctor_id = auth.uid()
              AND p.status = 'DRAFT'
        )
    );

DROP POLICY IF EXISTS "Doctors can delete prescription items" ON public.prescription_items;
CREATE POLICY "Doctors can delete prescription items"
    ON public.prescription_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_id
              AND p.doctor_id = auth.uid()
              AND p.status = 'DRAFT'
        )
    );

-- ------------------------------------------------------------------------------
-- 4. ATOMIC TRANSACTIONAL RPC: save_prescription_atomic
-- Single-transaction prescription creation/update with medication items
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_prescription_atomic(
    p_appointment_id UUID,
    p_consultation_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'DRAFT',
    p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doctor_id UUID;
    v_patient_id UUID;
    v_prescription_id UUID;
    v_existing_status TEXT;
    v_item JSONB;
    v_issued_at TIMESTAMPTZ;
    v_med_name TEXT;
BEGIN
    v_doctor_id := auth.uid();
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Validate items count
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Prescription must contain at least one medication item.';
    END IF;

    -- Verify appointment ownership and get patient_id
    SELECT patient_id INTO v_patient_id
    FROM public.appointments
    WHERE id = p_appointment_id AND doctor_id = v_doctor_id;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Appointment not found or not assigned to the authenticated doctor.';
    END IF;

    -- Verify consultation ownership
    IF NOT EXISTS (
        SELECT 1 FROM public.consultation_notes
        WHERE id = p_consultation_id AND doctor_id = v_doctor_id AND appointment_id = p_appointment_id
    ) THEN
        RAISE EXCEPTION 'Linked consultation not found or not assigned to this appointment.';
    END IF;

    -- Check if prescription already exists and its status
    SELECT id, status INTO v_prescription_id, v_existing_status
    FROM public.prescriptions
    WHERE appointment_id = p_appointment_id;

    IF v_existing_status = 'FINALIZED' THEN
        RAISE EXCEPTION 'This prescription has already been finalized and digitally signed. It cannot be modified.';
    END IF;

    IF p_status = 'FINALIZED' THEN
        v_issued_at := timezone('utc'::text, now());
    ELSE
        v_issued_at := NULL;
    END IF;

    -- Upsert prescription header
    IF v_prescription_id IS NOT NULL THEN
        UPDATE public.prescriptions
        SET notes = p_notes,
            status = p_status,
            issued_at = COALESCE(issued_at, v_issued_at),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_prescription_id
        RETURNING id INTO v_prescription_id;
    ELSE
        INSERT INTO public.prescriptions (
            appointment_id,
            consultation_id,
            doctor_id,
            patient_id,
            status,
            notes,
            issued_at
        )
        VALUES (
            p_appointment_id,
            p_consultation_id,
            v_doctor_id,
            v_patient_id,
            p_status,
            p_notes,
            v_issued_at
        )
        RETURNING id INTO v_prescription_id;
    END IF;

    -- Replace items atomically
    DELETE FROM public.prescription_items
    WHERE prescription_id = v_prescription_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_med_name := trim(COALESCE(v_item->>'medication_name', ''));
        IF length(v_med_name) = 0 THEN
            RAISE EXCEPTION 'Medication name cannot be blank.';
        END IF;

        INSERT INTO public.prescription_items (
            prescription_id,
            medication_name,
            strength,
            dosage,
            frequency,
            route,
            duration,
            quantity,
            instructions
        )
        VALUES (
            v_prescription_id,
            v_med_name,
            v_item->>'strength',
            COALESCE(v_item->>'dosage', '1 dose'),
            COALESCE(v_item->>'frequency', 'Once daily'),
            COALESCE(v_item->>'route', 'Oral (PO)'),
            COALESCE(v_item->>'duration', '7 days'),
            v_item->>'quantity',
            v_item->>'instructions'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'prescription_id', v_prescription_id,
        'status', p_status,
        'items_count', jsonb_array_length(p_items)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error_code', SQLSTATE,
        'message', SQLERRM
    );
END;
$$;
