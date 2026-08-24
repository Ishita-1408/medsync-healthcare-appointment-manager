-- ==============================================================================
-- MedSync Migration 002: Row Level Security (RLS) & Safe Profile Provisioning
-- File: supabase/migrations/002_auth_and_rls.sql
-- ==============================================================================

-- 1. Enable RLS on all foundation tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id AND role IN ('PATIENT', 'DOCTOR'));

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
-- Prevent self-escalation to ADMIN by requiring role to match existing role
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. PATIENT_PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Patients can view their own profile" ON patient_profiles;
CREATE POLICY "Patients can view their own profile"
    ON patient_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Patients can insert their own profile" ON patient_profiles;
CREATE POLICY "Patients can insert their own profile"
    ON patient_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Patients can update their own profile" ON patient_profiles;
CREATE POLICY "Patients can update their own profile"
    ON patient_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 4. DOCTOR_PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone authenticated can view doctor profiles" ON doctor_profiles;
CREATE POLICY "Anyone authenticated can view doctor profiles"
    ON doctor_profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Doctors can insert their own doctor profile" ON doctor_profiles;
CREATE POLICY "Doctors can insert their own doctor profile"
    ON doctor_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Doctors can update their own doctor profile" ON doctor_profiles;
CREATE POLICY "Doctors can update their own doctor profile"
    ON doctor_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 5. DOCTOR_WORKING_HOURS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone authenticated can view working hours" ON doctor_working_hours;
CREATE POLICY "Anyone authenticated can view working hours"
    ON doctor_working_hours FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Doctors can manage their own working hours" ON doctor_working_hours;
CREATE POLICY "Doctors can manage their own working hours"
    ON doctor_working_hours FOR ALL
    TO authenticated
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 6. DOCTOR_LEAVES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone authenticated can view doctor leaves" ON doctor_leaves;
CREATE POLICY "Anyone authenticated can view doctor leaves"
    ON doctor_leaves FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Doctors can manage their own leaves" ON doctor_leaves;
CREATE POLICY "Doctors can manage their own leaves"
    ON doctor_leaves FOR ALL
    TO authenticated
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 7. APPOINTMENTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own appointments" ON appointments;
CREATE POLICY "Users can view their own appointments"
    ON appointments FOR SELECT
    TO authenticated
    USING (patient_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients can create appointments" ON appointments;
CREATE POLICY "Patients can create appointments"
    ON appointments FOR INSERT
    TO authenticated
    WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own appointments" ON appointments;
CREATE POLICY "Users can update their own appointments"
    ON appointments FOR UPDATE
    TO authenticated
    USING (patient_id = auth.uid() OR doctor_id = auth.uid())
    WITH CHECK (patient_id = auth.uid() OR doctor_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 8. AUTOMATIC PROFILE PROVISIONING TRIGGER (SECURITY DEFINER)
-- Ensures profiles & role-specific tables are safely created on signup
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_role TEXT;
    user_first_name TEXT;
    user_last_name TEXT;
    user_phone TEXT;
    doc_specialization TEXT;
    doc_license TEXT;
BEGIN
    -- Read role from signup metadata; strictly disallow public self-assignment of ADMIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'PATIENT');
    IF user_role NOT IN ('PATIENT', 'DOCTOR') THEN
        user_role := 'PATIENT';
    END IF;

    user_first_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''), 'User');
    user_last_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), ''), '');
    user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '');

    -- 1. Create entry in public.profiles
    INSERT INTO public.profiles (id, first_name, last_name, role, phone_number)
    VALUES (NEW.id, user_first_name, user_last_name, user_role, user_phone)
    ON CONFLICT (id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = EXCLUDED.role,
        phone_number = EXCLUDED.phone_number,
        updated_at = timezone('utc'::text, now());

    -- 2. Create entry in role-specific profile table
    IF user_role = 'PATIENT' THEN
        INSERT INTO public.patient_profiles (id)
        VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
    ELSIF user_role = 'DOCTOR' THEN
        doc_specialization := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'specialization'), ''), 'General Medicine');
        doc_license := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'license_number'), ''), 'PENDING-' || SUBSTRING(NEW.id::TEXT, 1, 8));
        
        INSERT INTO public.doctor_profiles (id, specialization, license_number)
        VALUES (NEW.id, doc_specialization, doc_license)
        ON CONFLICT (id) DO UPDATE SET
            specialization = EXCLUDED.specialization,
            license_number = EXCLUDED.license_number,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
