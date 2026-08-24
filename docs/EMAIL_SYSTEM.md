# MedSync Transactional Email System Architecture

---

## 1. Overview & Core Design Principles

The MedSync Email Notification System is an enterprise-grade, asynchronous, transactional notification engine designed to reliably deliver clinical and appointment updates to both patients and healthcare providers.

### Key Architectural Guarantees:
1. **Arbitrary Recipient Support**: Recipient addresses are dynamically resolved at runtime from the authenticated user's registered Supabase Auth account (`auth.users.email`).
2. **Zero Hardcoded Developer Credentials**: No developer email addresses, passwords, or personal inboxes exist anywhere in the application code or delivery pipelines.
3. **Non-Blocking UI Flow**: Appointment booking, cancellations, and clinical consultations execute immediately. Email jobs are placed onto a transactional queue (`public.email_jobs`) and processed asynchronously by background workers.
4. **Strict Delivery Truth (No Fake `SENT` States)**: Jobs are marked as `SENT` if and only if the upstream transactional provider confirms acceptance with a unique message ID (`provider_message_id`). If rejected or restricted by provider policies, the error is recorded in `last_error` and processed via exponential backoff retries.
5. **Provider Agnostic**: Configurable via `EMAIL_PROVIDER=resend` (default), `EMAIL_PROVIDER=smtp`, or `EMAIL_PROVIDER=mock`.

---

## 2. End-to-End Delivery Flow

```
[User Registers / Logs In]
       │  (email stored in auth.users.email)
       ▼
[Patient Books Appointment] ──► (Appointments Table: status = 'CONFIRMED')
                                         │
                                         ▼
                      [PostgreSQL Trigger: trg_appointment_email_jobs]
                                         │
                                         ▼
                      [SECURITY DEFINER Function: handle_appointment_email_jobs]
                                         │
                       Resolves:
                         • v_patient_email FROM auth.users WHERE id = NEW.patient_id
                         • v_doctor_email FROM auth.users WHERE id = NEW.doctor_id
                                         │
                                         ▼
                      [Queue Email Job in public.email_jobs]
                         • recipient_email: (User's registered email)
                         • email_type: 'BOOKING_CONFIRMATION'
                         • status: 'PENDING'
                                         │
                                         ▼
                      [Background Worker: backend/src/workers/emailWorker.js]
                         • Claims job via RPC claim_next_email_job()
                         • Uses FOR UPDATE SKIP LOCKED for concurrent worker safety
                                         │
                                         ▼
                      [Provider Adapter: backend/src/services/emailService.js]
                         • Resend API (HTTP POST /emails) or SMTP Transport
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
               [Provider Accepts]                [Provider Rejects / Errors]
                        │                                 │
               • status = 'SENT'                 • status = 'RETRY' / 'FAILED'
               • provider_message_id = ID        • last_error = error.message
               • sent_at = NOW()                 • exponential backoff delay
```

---

## 3. Dynamic Recipient Resolution

In migration `018_fix_appointment_email_triggers.sql`, recipient emails are strictly sourced from `auth.users`:

```sql
-- 1. Resolve Patient's Registered Email
SELECT email INTO v_patient_email
FROM auth.users
WHERE id = NEW.patient_id;

-- 2. Resolve Doctor's Registered Email
SELECT email INTO v_doctor_email
FROM auth.users
WHERE id = NEW.doctor_id;
```

### Supported Email Event Types:
1. `BOOKING_CONFIRMATION` (Immediate upon booking or hold confirmation)
2. `APPOINTMENT_REMINDER_24H` (Dispatched 24 hours prior to appointment)
3. `APPOINTMENT_REMINDER_2H` (Dispatched 2 hours prior to appointment)
4. `APPOINTMENT_CANCELLATION` (Dispatched upon patient/doctor cancellation)
5. `PRESCRIPTION_READY` (Dispatched upon doctor finalizing SOAP note & digital Rx)
6. `MEDICATION_REMINDER` (Dispatched according to prescribed medication schedule)

---

## 4. Provider Architecture & Configuration

The email dispatcher (`backend/src/services/emailService.js`) uses a pluggable provider abstraction controlled by the `EMAIL_PROVIDER` environment variable:

```env
# Backend Environment Configuration (backend/.env)
EMAIL_PROVIDER=resend
EMAIL_FROM=MedSync Health <onboarding@resend.dev>

# Option A: Resend API (Default)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx

# Option B: Standard SMTP (Brevo, SendGrid, Amazon SES, Mailtrap)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

---

## 5. Provider Limitations & Domain Verification Requirements

### Why Free Transactional Providers Restrict Unverified Domains:
All major email providers (Resend, SendGrid, Brevo, Mailgun, Postmark, Amazon SES) enforce industry anti-spam standards (RFC 5321, DMARC, DKIM, SPF):

1. **The Resend Free Sandbox (`onboarding@resend.dev`)**:
   - Out of the box, without a verified domain, Resend assigns `onboarding@resend.dev`.
   - Under Resend's anti-abuse policy, `onboarding@resend.dev` **only permits delivery to the specific email address registered with the Resend developer account**.
   - If an application attempts to send from `onboarding@resend.dev` to an external inbox (e.g. `reviewer@outlook.com` or `rahul@gmail.com`), the Resend API returns:
     ```json
     {
       "statusCode": 403,
       "name": "validation_error",
       "message": "You can only send testing emails to your own email address. To send emails to other recipients, please verify a domain at resend.com/domains."
     }
     ```
2. **Global Industry Standard (February 2024 RFC Enforcement)**:
   - Google and Yahoo reject all unauthenticated transactional emails that lack SPF/DKIM alignment on the sender domain.
   - **Technical Reality**: There is **no legitimate transactional email provider** in existence that permits automated, production delivery to arbitrary public inboxes without domain ownership verification.

---

## 6. Recommended Production Setup (Cost-Free / Low-Cost)

To enable live delivery to any arbitrary registered recipient:

### Step 1: Connect a Custom Domain in Resend
1. Log in to [Resend Dashboard](https://resend.com/domains).
2. Click **Add Domain** (e.g., `medsync.health` or any domain you own).
3. Add the 3 generated DNS records to your DNS provider (Cloudflare, Namecheap, GoDaddy):
   - `TXT` (SPF: `v=spf1 include:resend.com ~all`)
   - `TXT` (DKIM: `resend._domainkey.yourdomain.com`)
   - `MX` (Inbound handling: `feedback-smtp.resend.com`)
4. Once verified (usually within 2–5 minutes), update `backend/.env`:
   ```env
   EMAIL_FROM=MedSync Health <appointments@yourdomain.com>
   ```
5. **Cost**: $0 / month (Resend provides 3,000 free emails/month permanently). Domain cost: ~$3 - $10/year (or free subdomain).

### Step 2: Alternative Free SMTP Setup (Brevo / Sendinblue)
1. Create a free account at [Brevo](https://www.brevo.com/) (300 free emails/day).
2. Generate an SMTP Key in **Settings $\to$ Senders & IP $\to$ SMTP**.
3. Update `backend/.env`:
   ```env
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_brevo_login
   SMTP_PASS=your_brevo_smtp_key
   EMAIL_FROM=MedSync Health <notifications@yourverifiedsender.com>
   ```

---

## 7. Security & Compliance Safeguards

- **HTML Sanitization**: All patient names, doctor names, and clinical notes are HTML-escaped using `escapeHtml()` prior to template insertion to eliminate XSS / HTML injection vectors.
- **Prefix Normalization**: `formatDoctorName()` normalizes names to prevent duplicate titles (e.g. `'Dr. Dr. Angel'` $\to$ `'Dr. Angel'`).
- **Transactional Job Isolation**: Database RLS prevents unauthorized users from reading or spoofing rows in `public.email_jobs`.
- **Worker Concurrency**: Database stored procedure `claim_next_email_job()` guarantees single-worker execution with zero duplicate dispatches across clustered instances.

---

## 8. Verification Commands

To verify the email system and all integration test suites:

```bash
# 1. Run Email System Verification Suite
npm run test:email --prefix backend

# 2. Run Consolidated Integration Suite
npm run test:all --prefix backend

# 3. Verify Production Frontend Build
npm run build --prefix frontend
```
