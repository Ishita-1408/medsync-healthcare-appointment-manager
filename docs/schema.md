# MedSync Database Schema Documentation

---

## 1. Overview & Architecture

MedSync utilizes PostgreSQL hosted on **Supabase**, secured with granular **Row-Level Security (RLS)**, ACID transactions, exclusion/unique constraints, triggers, and atomic **Remote Procedure Calls (RPCs)**.

PostgreSQL serves as the ultimate authoritative source of truth for:
- Concurrency control and double-booking prevention.
- Clinical data integrity (Consultations, E-Prescriptions).
- Background queue management (`email_jobs`, `medication_reminders`).
- OAuth token persistence and calendar synchronization mapping.

---

## 2. Table Specifications

### 1. `public.profiles`
- **Purpose**: Core user account profile storing role and contact information, linked to `auth.users`.
- **Primary Key**: `id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- **Columns**: `id`, `first_name`, `last_name`, `email`, `role ('PATIENT', 'DOCTOR', 'ADMIN')`, `phone_number`, `avatar_url`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.
- **Policies**:
  - `Users can view own profile`: `USING (id = auth.uid())`
  - `Users can update own profile`: `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`
  - `Public profiles are viewable by authenticated users`: `USING (true)` for basic directory lookups.

---

### 2. `public.patient_profiles`
- **Purpose**: Specialized medical and demographic information for patients.
- **Primary Key**: `id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- **Columns**: `id`, `date_of_birth`, `gender`, `blood_group`, `emergency_contact_name`, `emergency_contact_phone`, `allergies`, `medical_history`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.
- **Policies**:
  - `Patients can view/update own profile`: `USING (id = auth.uid())`
  - `Doctors can view patient profile with appointment`: `USING (EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = id AND a.doctor_id = auth.uid()))`

---

### 3. `public.doctor_profiles`
- **Purpose**: Professional credentials, specialties, and consultation metadata for doctors.
- **Primary Key**: `id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- **Columns**: `id`, `specialization`, `license_number`, `bio`, `years_of_experience`, `consultation_fee`, `is_accepting_appointments`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.
- **Policies**:
  - `Public/authenticated users can view doctor directory`: `USING (is_accepting_appointments = true)`
  - `Doctors can edit own profile`: `USING (id = auth.uid())`

---

### 4. `public.doctor_working_hours`
- **Purpose**: Weekly recurring schedule defining available consultation windows.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `doctor_id (FK)`, `day_of_week (0=Sun, 6=Sat)`, `start_time (TIME)`, `end_time (TIME)`, `slot_duration_minutes (INT, default 30)`, `is_active (BOOLEAN)`.
- **Indexes**: `idx_doctor_working_hours_lookup ON (doctor_id, day_of_week)`.
- **RLS Status**: Enabled.

---

### 5. `public.doctor_leaves`
- **Purpose**: Scheduled leaves, holidays, or unavailable time ranges for doctors.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `doctor_id (FK)`, `start_time (TIMESTAMPTZ)`, `end_time (TIMESTAMPTZ)`, `reason (TEXT)`, `created_at`.
- **Triggers**:
  - `trg_handle_doctor_leave_impact`: Automatically detects overlapping confirmed appointments, cancels them, updates calendar mappings, and dispatches in-app and email notifications.
- **RLS Status**: Enabled.

---

### 6. `public.appointments`
- **Purpose**: Canonical booking record between a patient and a doctor.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `patient_id (FK)`, `doctor_id (FK)`, `start_time (TIMESTAMPTZ)`, `end_time (TIMESTAMPTZ)`, `status ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'RESCHEDULED')`, `reason (TEXT)`, `cancellation_reason (TEXT)`, `created_at`, `updated_at`.
- **Constraints & Indexes**:
  - Unique exclusion check preventing overlapping confirmed appointments per doctor.
  - `idx_appointments_doctor_time ON (doctor_id, start_time, status)`.
  - `idx_appointments_patient ON (patient_id, start_time)`.
- **RLS Status**: Enabled (Recursion-free helper views).

---

### 7. `public.appointment_holds`
- **Purpose**: Temporary 10-minute locks held while a patient reviews booking details.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `doctor_id (FK)`, `patient_id (FK)`, `start_time (TIMESTAMPTZ)`, `end_time (TIMESTAMPTZ)`, `expires_at (TIMESTAMPTZ)`, `created_at`.
- **Unique Constraint**: `(doctor_id, start_time)` ensures no two patients can hold the same slot.
- **RLS Status**: Enabled.

---

### 8. `public.appointment_intakes`
- **Purpose**: Structured pre-visit questionnaire submitted by patient prior to appointment.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `appointment_id (FK UNIQUE)`, `patient_id (FK)`, `chief_complaint (TEXT)`, `symptom_description (TEXT)`, `severity ('MILD', 'MODERATE', 'SEVERE')`, `onset (TEXT)`, `medications (TEXT)`, `allergies (TEXT)`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.

---

### 9. `public.ai_pre_visit_summaries`
- **Purpose**: AI-generated triage briefing and suggested clinical probe questions.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `appointment_id (FK UNIQUE)`, `urgency ('Low', 'Medium', 'High')`, `chief_complaint (TEXT)`, `suggested_questions (JSONB)`, `model_used (TEXT)`, `status ('PENDING', 'COMPLETED', 'FAILED')`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.

---

### 10. `public.consultation_notes`
- **Purpose**: Official clinical encounter record authored by the doctor.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `appointment_id (FK UNIQUE)`, `doctor_id (FK)`, `patient_id (FK)`, `chief_complaint (TEXT)`, `examination_notes (TEXT)`, `diagnosis (TEXT)`, `treatment_plan (TEXT)`, `doctor_notes (TEXT)`, `follow_up_instructions (TEXT)`, `follow_up_date (DATE)`, `is_finalized (BOOLEAN)`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.

---

### 11. `public.prescriptions` & `public.prescription_items`
- **Purpose**: Official digital prescriptions with detailed medication instructions.
- **`prescriptions` Columns**: `id`, `appointment_id (FK UNIQUE)`, `consultation_id (FK UNIQUE)`, `doctor_id (FK)`, `patient_id (FK)`, `status ('DRAFT', 'FINALIZED', 'CANCELLED')`, `notes (TEXT)`, `issued_at (TIMESTAMPTZ)`.
- **`prescription_items` Columns**: `id`, `prescription_id (FK)`, `medication_name (TEXT)`, `strength (TEXT)`, `dosage (TEXT)`, `frequency (TEXT)`, `route (TEXT)`, `duration (TEXT)`, `quantity (TEXT)`, `instructions (TEXT)`.
- **Triggers**:
  - `trg_generate_medication_reminders`: Automatically populates reminder rows on prescription finalization.
- **RLS Status**: Enabled.

---

### 12. `public.ai_post_visit_summaries`
- **Purpose**: Patient-friendly visit summary and medication guide grounded in doctor's notes.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `appointment_id (FK UNIQUE)`, `summary (TEXT)`, `diagnosis_explanation (TEXT)`, `medications (JSONB)`, `follow_up (JSONB)`, `model_used (TEXT)`, `status ('PENDING', 'COMPLETED', 'FAILED')`, `created_at`, `updated_at`.
- **RLS Status**: Enabled.

---

### 13. `public.notifications`
- **Purpose**: In-app notifications for patients, doctors, and administrators.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `user_id (FK)`, `appointment_id (FK)`, `type (TEXT)`, `title (TEXT)`, `message (TEXT)`, `is_read (BOOLEAN)`, `metadata (JSONB)`, `created_at`.
- **RLS Status**: Enabled.

---

### 14. `public.email_jobs`
- **Purpose**: Transactional email queue with exponential backoff and dead-letter handling.
- **Primary Key**: `id UUID DEFAULT gen_random_uuid()`
- **Columns**: `id`, `appointment_id (FK)`, `recipient_id (FK)`, `recipient_email (TEXT)`, `recipient_name (TEXT)`, `email_type (TEXT)`, `subject (TEXT)`, `payload (JSONB)`, `status ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED', 'CANCELLED')`, `attempts (INT)`, `max_attempts (INT, default 5)`, `next_retry_at (TIMESTAMPTZ)`, `locked_at (TIMESTAMPTZ)`, `locked_by (TEXT)`, `sent_at (TIMESTAMPTZ)`, `last_error (TEXT)`, `provider_message_id (TEXT)`, `created_at`, `updated_at`.
- **Unique Constraint**: `idx_unique_appointment_email_job` ON `(appointment_id, email_type)` prevents duplicate emails.
- **RLS Status**: Enabled.

---

### 15. `public.user_calendar_tokens` & `public.appointment_calendar_events`
- **Purpose**: Secure OAuth 2.0 refresh token persistence and appointment-to-Google-event mapping.
- **`user_calendar_tokens` Columns**: `id`, `user_id (FK UNIQUE)`, `provider ('google')`, `refresh_token (TEXT)`, `access_token (TEXT)`, `expires_at (TIMESTAMPTZ)`, `scopes (TEXT[])`, `is_active (BOOLEAN)`.
- **`appointment_calendar_events` Columns**: `id`, `appointment_id (FK)`, `user_id (FK)`, `google_event_id (TEXT)`, `status ('SYNCED', 'FAILED', 'DELETED')`, `synced_at (TIMESTAMPTZ)`.
- **RLS Status**: Enabled.

---

### 16. `public.medication_reminders`
- **Purpose**: Medication reminder queue generated from finalized prescriptions.
- **Columns**: `id`, `prescription_item_id (FK)`, `patient_id (FK)`, `medication_name`, `dosage`, `frequency`, `instructions`, `scheduled_time (TIMESTAMPTZ)`, `status ('PENDING', 'SENT', 'DISMISSED', 'SKIPPED')`, `sent_at`.
- **RLS Status**: Enabled.

---

## 3. End-to-End Data Flows

### A. Appointment Booking & Concurrency Flow
```
Patient selects slot
       ↓
POST hold_appointment_slot()
       ↓ (10-minute hold created in appointment_holds)
Patient reviews & confirms
       ↓
POST book_appointment_atomic()
       ↓
• Validates doctor working hours & active doctor leaves
• Verifies no existing CONFIRMED appointment in slot
• Inserts appointment row with status = 'CONFIRMED'
• Releases hold from appointment_holds
• Queues in-app notification & email_job ('BOOKING_CONFIRMATION')
• Triggers Google Calendar synchronization
```

### B. AI Clinical Data Flow
```
Pre-Visit:
Patient Intake Form → appointment_intakes
                    ↓
POST /api/ai/pre-visit-summary
                    ↓
OpenAI/Gemini/Fallback → ai_pre_visit_summaries (Urgency + 3 Probes)
                    ↓
Doctor Dashboard (Modal displays triage info before consultation)

Post-Visit:
Doctor Consultation Note + E-Prescription Finalized
                    ↓
POST /api/ai/post-visit-summary
                    ↓
Authoritative DB Binding (consultation_notes + prescription_items)
                    ↓
OpenAI/Gemini/Fallback → ai_post_visit_summaries (Patient Care Plan)
```

### C. Background Email Queue & Worker Flow
```
Event Trigger (Booking, Cancellation, Prescription, Reminders)
                    ↓
INSERT INTO public.email_jobs (status = 'PENDING')
                    ↓
Background Email Worker (every 30s)
                    ↓
RPC claim_next_email_job() [FOR UPDATE SKIP LOCKED]
                    ↓
sendEmail() via Resend Transactional API
 ├── Success → status = 'SENT', provider_message_id recorded
 └── Failure → status = 'RETRY' (delays: 1m, 5m, 15m, 60m, 240m)
              └── > 5 attempts → status = 'FAILED' (Dead-letter)
```

### D. Google Calendar Sync Flow
```
Doctor/Patient connects Google OAuth (/api/calendar/auth/url)
                    ↓
Callback exchanges code for refresh_token → user_calendar_tokens
                    ↓
Appointment Confirmed / Rescheduled / Cancelled
                    ↓
POST /api/calendar/sync/:appointmentId
 ├── Booking: calendar.events.insert() → google_event_id saved
 ├── Reschedule: calendar.events.patch() → start/end time updated
 └── Cancellation: calendar.events.delete() → event removed from Google
```

---

## 4. Security & Access Control Model

1. **Client Isolation**: All secret keys (`RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) are stored in server-side `.env` files and never included in Vite/React bundles.
2. **Row-Level Security (RLS)**: Enforced on all tables with explicit `auth.uid()` checks.
3. **Helper Views**: Prevent infinite recursion on relational queries while maintaining strict isolation.
4. **Input Sanitization**: Dynamic HTML escaping prevents XSS across all outbound transactional emails.
