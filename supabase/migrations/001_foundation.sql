-- ==============================================================================
-- MedSync Foundation Migration: Core Schema, Constraints & Concurrency Protection
-- File: supabase/migrations/001_foundation.sql
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ------------------------------------------------------------------------------
-- Helper function to automatically update `updated_at` column
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- Extends Supabase Auth users with role and profile metadata
-- ------------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'ADMIN')),
    phone_number TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_profiles_role ON profiles(role);

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. PATIENT_PROFILES TABLE
-- 1-to-1 extension of profiles for patients
-- ------------------------------------------------------------------------------
CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
    blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER trg_patient_profiles_updated_at
    BEFORE UPDATE ON patient_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. DOCTOR_PROFILES TABLE
-- 1-to-1 extension of profiles for doctors
-- ------------------------------------------------------------------------------
CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    specialization TEXT NOT NULL,
    license_number TEXT NOT NULL UNIQUE,
    bio TEXT,
    consultation_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (consultation_duration_minutes > 0 AND consultation_duration_minutes <= 480),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_doctor_profiles_specialization ON doctor_profiles(specialization);
CREATE INDEX idx_doctor_profiles_is_active ON doctor_profiles(is_active);

CREATE TRIGGER trg_doctor_profiles_updated_at
    BEFORE UPDATE ON doctor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. DOCTOR_WORKING_HOURS TABLE
-- Defines weekly recurring availability intervals (supports split shifts)
-- ------------------------------------------------------------------------------
CREATE TABLE doctor_working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_working_hours_valid_interval CHECK (end_time > start_time)
);

CREATE INDEX idx_doctor_working_hours_lookup ON doctor_working_hours(doctor_id, day_of_week) WHERE is_active = true;

CREATE TRIGGER trg_doctor_working_hours_updated_at
    BEFORE UPDATE ON doctor_working_hours
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. DOCTOR_LEAVES TABLE
-- Overrides normal working hours for planned time off or emergencies
-- ------------------------------------------------------------------------------
CREATE TABLE doctor_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_doctor_leaves_valid_range CHECK (end_time > start_time)
);

CREATE INDEX idx_doctor_leaves_range ON doctor_leaves(doctor_id, start_time, end_time);

CREATE TRIGGER trg_doctor_leaves_updated_at
    BEFORE UPDATE ON doctor_leaves
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. APPOINTMENTS TABLE
-- Stores booking records with database-level race-condition prevention
-- ------------------------------------------------------------------------------
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    hold_expires_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_appointment_valid_range CHECK (end_time > start_time),
    CONSTRAINT chk_appointment_hold_expiry
    CHECK (
        (status = 'HELD' AND hold_expires_at IS NOT NULL)
        OR
        (status <> 'HELD' AND hold_expires_at IS NULL)
    ),
    -- Concurrency & Double-Booking Protection:
    -- Prevents overlapping active ('HELD' or 'CONFIRMED') appointments for the same doctor at the PostgreSQL engine level.
    CONSTRAINT prevent_overlapping_doctor_appointments
    EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    )
    WHERE (status IN ('HELD', 'CONFIRMED'))
);

-- Fast lookup indexes for common queries
CREATE INDEX idx_appointments_doctor_schedule ON appointments(doctor_id, start_time, end_time);
CREATE INDEX idx_appointments_patient ON appointments(patient_id, start_time);
CREATE INDEX idx_appointments_status ON appointments(status);

CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
