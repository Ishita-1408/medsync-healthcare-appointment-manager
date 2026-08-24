# MedSync Healthcare Appointment & Follow-up Manager — System Design

---

## 1. System Architecture Overview

MedSync is an end-to-end healthcare appointment, clinical workflow, and follow-up care platform engineered for resilience, data correctness, and strict multi-tenant isolation. The system cleanly separates client presentation from server-side external API execution while enforcing PostgreSQL as the authoritative source of truth.

```
+-------------------------------------------------------------------------+
|                              USER CLIENTS                               |
|          Patient Dashboard  •  Doctor Portal  •  Admin Console          |
|                             (React 19 + Vite)                           |
+------------------------------------+------------------------------------+
                                     |
                                     v HTTPS (Supabase JWT)
+------------------------------------+------------------------------------+
|                         MEDSYNC API BACKEND                             |
|               (Node.js / Express Modular REST Service)                  |
|                                                                         |
|  • AI Triage & Care Plan Controller • Calendar OAuth & Sync Service     |
|  • Background Email Worker (Resend) • Medication Reminders Dispatcher   |
+------------------+------------------------------------+-----------------+
                   |                                    |
                   v Service-Role / Auth Context        v External APIs
+------------------+-----------------+    +-------------+-----------------+
|      SUPABASE POSTGRESQL LAYER     |    |   THIRD-PARTY INTEGRATIONS    |
|                                    |    |                               |
| • 17 Tables with Granular RLS      |    | • OpenAI / Gemini (AI Triage) |
| • Atomic RPCs (SKIP LOCKED)        |    | • Resend API (Trans. Email)   |
| • Automatic Audit & Leave Triggers |    | • Google Calendar (OAuth 2.0) |
+------------------------------------+    +-------------------------------+
```

---

## 2. Appointment Booking & Concurrency Protection

Appointment booking is designed to prevent race conditions, double bookings, and stale slot allocations:
1. **Dynamic Slot Generation**: The frontend queries `doctor_working_hours` and active `doctor_leaves` to compute valid 30-minute intervals in the doctor's local timezone.
2. **10-Minute Reservation Holds**: When a patient selects an available time slot, `hold_appointment_slot()` atomically creates a temporary hold record in `public.appointment_holds` with a 10-minute expiration window (`expires_at`), preventing other patients from selecting the same slot during checkout.
3. **Atomic Booking Execution**: The final booking is executed through `book_appointment_atomic()`. This PostgreSQL transaction performs strict validation:
   - Verifies the doctor has not scheduled an active leave in `public.doctor_leaves`.
   - Checks that no existing confirmed appointment occupies the slot.
   - Converts the hold into a `CONFIRMED` appointment record in `public.appointments`.
   - Releases the hold and queues in-app notifications, email jobs, and calendar sync jobs within the same ACID transaction boundary.
4. **Database-Level Exclusion**: A unique index on `(doctor_id, start_time)` for non-cancelled statuses guarantees that even under extreme concurrent load, two transactions cannot insert overlapping bookings.

---

## 3. Doctor Leave Conflict Handling

When a doctor schedules time off in `public.doctor_leaves`, the database trigger `trg_handle_doctor_leave_impact` automatically executes:
- Finds all overlapping confirmed appointments across the leave duration.
- Transitions affected appointments to `CANCELLED` with a cancellation reason.
- Inserts high-priority in-app notifications and queues `APPOINTMENT_CANCELLATION` email jobs for affected patients.
- Invokes calendar synchronization to remove cancelled events from Google Calendar.
- Re-opens future availability calculations to block any further bookings during the leave window.

---

## 4. AI / LLM Clinical Architecture

MedSync integrates AI as an administrative and clinical decision-support tool while maintaining strict medical safety guardrails:
- **Pre-Visit Intake & Triage**: When a patient submits a structured intake (chief complaint, severity, onset, medications, allergies), the backend invokes `POST /api/ai/pre-visit-summary`. The prompt instructs the LLM (OpenAI `gpt-4o-mini` or Google `gemini-1.5-flash`) to generate a triage urgency assessment (`Low`, `Medium`, `High`) and 3 probe questions for the physician. The system prompt strictly prohibits clinical diagnoses.
- **Post-Visit Patient Care Summary**: Upon consultation finalization, `POST /api/ai/post-visit-summary` generates a patient-friendly visit overview. To prevent hallucinations:
  - Prescriptions and medications are strictly mapped from authoritative database records in `public.prescription_items`.
  - The `isPlaceholderDiagnosis` filter guarantees that only genuine doctor-entered diagnoses are displayed; if unspecified, the summary explicitly states that no diagnosis was formally recorded.
  - An intelligent cache invalidation mechanism regenerates summaries whenever new prescription items are finalized.
- **Deterministic Fallbacks**: If external AI APIs are unreachable or unconfigured, the backend falls back to rule-based clinical templates without blocking user operations.

---

## 5. Transactional Email & Background Worker Architecture

Email notifications are decoupled from the HTTP request-response cycle using an asynchronous queue:
- **Queue Table (`public.email_jobs`)**: Application events insert job rows with statuses `PENDING`, `PROCESSING`, `SENT`, `RETRY`, `FAILED`, `CANCELLED`.
- **Worker Concurrency Protection**: The background worker polls the queue every 30 seconds using the RPC `claim_next_email_job()`, which uses PostgreSQL `FOR UPDATE SKIP LOCKED` to ensure multiple worker instances never process the same email simultaneously.
- **Exponential Backoff**: If the transactional provider (Resend) fails or encounters network issues, the worker calculates exponential backoff intervals ($1\text{m} \rightarrow 5\text{m} \rightarrow 15\text{m} \rightarrow 60\text{m} \rightarrow 240\text{m}$). After 5 attempts, the job is moved to a dead-letter `FAILED` state with error logging.
- **Duplicate Prevention**: The unique index `idx_unique_appointment_email_job` prevents accidental duplicate job creation.
- **Non-Blocking Isolation**: Transactional email failures never roll back appointment bookings, prescriptions, or consultations.

---

## 6. Google Calendar Synchronization

MedSync integrates Google Calendar via OAuth 2.0:
- **Token Persistence**: Refresh tokens are stored securely in `public.user_calendar_tokens` via the backend OAuth callback.
- **Lifecycle Mapping**:
  - **Booking**: Creates a Google Calendar event (`calendar.events.insert()`) and saves the `google_event_id` in `public.appointment_calendar_events`.
  - **Rescheduling**: Updates the event start and end time (`calendar.events.patch()`).
  - **Cancellation**: Deletes the event from Google Calendar (`calendar.events.delete()`).
- **Decoupled Resilience**: Calendar sync is non-blocking; if a token is revoked or Google's API fails, the internal appointment record remains intact.

---

## 7. Security & Row-Level Security (RLS)

1. **Server-Side Secret Isolation**: Private keys (`RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) reside exclusively in `backend/.env` and are never exposed to Vite or React bundles.
2. **Row-Level Security (RLS)**: Enforced across all 17 database tables. Patients can only access their own appointments, intakes, prescriptions, and notifications; doctors can only access records for patients with confirmed appointments.
3. **Helper Views**: Prevent infinite recursion on cross-table RLS policies.
4. **Input Sanitization**: Outbound email templates sanitize all variables through `escapeHtml` to eliminate XSS vulnerabilities.
