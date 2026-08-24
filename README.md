# MedSync Healthcare Appointment & Follow-up Manager

MedSync is a production-grade healthcare management and clinical workflow platform designed to streamline doctor-patient appointments, pre-visit symptom intake, AI clinical triage, digital e-prescriptions, automated medication schedules, and bidirectional Google Calendar synchronization.

---

<img width="937" height="476" alt="MedSync Hero Banner" src="https://github.com/user-attachments/assets/42a6a377-6c03-44e4-b68c-7d2a070608cc" />

---

## 🚀 Live Demo

**Live Application:** [https://medsync-healthcare-appointment-mana.vercel.app/](https://medsync-healthcare-appointment-mana.vercel.app/)

- **Frontend Client:** Deployed on **Vercel** (`https://medsync-healthcare-appointment-mana.vercel.app/`)
- **Backend REST API:** Deployed on **Render** (`https://medsync-healthcare-appointment-manager.onrender.com/api`)
- **Database & Authentication:** Hosted on **Supabase** (PostgreSQL with Row-Level Security)

---

## 🛠️ Technology & Deployment Stack

- **Frontend**: React 19 + Vite
- **Backend**: Node.js + Express (Modular REST API)
- **Database & Auth**: Supabase (PostgreSQL with Row-Level Security)
- **Frontend Deployment**: Vercel
- **Backend Deployment**: Render
- **Calendar Integration**: Google Calendar API (OAuth 2.0)
- **Email Service**: Resend (Transactional Email Queue Worker)
- **AI / LLMs**: Google Gemini (`gemini-1.5-flash`) / OpenAI (`gpt-4o-mini`)

---

## 📝 Assignment Submission Note

This repository contains the application source code, database migration scripts, test suites, and documentation required for evaluation. Sensitive environment files (`.env`, `.env.local`), `node_modules/`, build artifacts (`dist/`, `build/`), temporary log files, and editor directories are strictly excluded from version control in adherence to security and repository best practices.

---

## 1. Project Overview

MedSync bridges the gap between patient appointment booking and clinical care delivery. It provides:
- **Intelligent Slot Management**: Timezone-aware slot generation with 10-minute temporary reservation holds and PostgreSQL ACID concurrency protection.
- **AI Clinical Decision Support**: Pre-visit intake triage and suggested probe questions for physicians, plus post-visit patient-friendly care plans grounded in authoritative doctor prescriptions.
- **Automated Communication**: Transactional email dispatch via Resend with exponential backoff retry queues and Google Calendar OAuth 2.0 lifecycle synchronization.

---

## 2. Key Features

### Patient Portal
- **Authentication & Profile**: Secure registration, login, and medical history management.
- **Doctor Search & Booking**: Filter by specialty, view ratings and fees, and hold slots for 10 minutes.
- **Pre-Visit Symptom Intake**: Submit chief complaints, onset, severity, current medications, and allergies.
- **AI Care Summaries**: View doctor notes, simplified diagnosis explanations, and digital prescriptions.
- **Notifications & Calendar**: Real-time in-app alerts and Google Calendar event synchronization.

<img width="926" height="482" alt="Patient Portal Search & Booking" src="https://github.com/user-attachments/assets/3ded09be-7f4e-4830-824c-0ce10e5a1789" />
<img width="873" height="470" alt="Patient Slot Hold Timer" src="https://github.com/user-attachments/assets/6840615b-c863-4d5b-bfee-5a79e435f2ac" />
<img width="892" height="487" alt="Pre-visit Intake Questionnaire" src="https://github.com/user-attachments/assets/4161ce5c-a1b1-4388-a3a3-046a06d7c779" />
<img width="887" height="380" alt="AI Care Summary & Digital Prescription" src="https://github.com/user-attachments/assets/3e0640f8-3a80-4c3a-aafc-8ee99a610e15" />

### Doctor Portal
- **Clinical Schedule Management**: Configure weekly working hours and schedule leaves with automated patient conflict resolution.
- **Appointment Queue**: Real-time list of upcoming, in-progress, and past patient consultations.
- **Pre-Visit AI Briefing**: Review patient intake triage urgency (`Low`, `Medium`, `High`) and 3 clinical probe questions before starting visits.
- **Consultation Notes & E-Prescriptions**: Document SOAP clinical notes and write multi-item digital prescriptions with dosages, frequencies, and instructions.

<img width="918" height="471" alt="Doctor Portal & Clinical Workstation" src="https://github.com/user-attachments/assets/0166ee4e-b8ec-4308-a25c-1e51c2462ab1" />

### Administrator Console
- **System Monitoring**: View total appointments, active physicians, and platform metrics.
- **Doctor Directory Management**: Approve and manage physician profiles.

<img width="926" height="491" alt="Administrator Console" src="https://github.com/user-attachments/assets/97dfff81-1227-4c50-a0cc-060202a84e9a" />

---

## 3. Architecture Diagram

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

## 4. Project Structure

```
MedSync/
├── backend/                      # Node.js + Express API server
│   ├── src/
│   │   ├── config/               # Environment & integration configuration
│   │   ├── controllers/          # AI, Calendar, and Email controllers
│   │   ├── middleware/           # Supabase JWT authentication & error handlers
│   │   ├── routes/               # Modular REST routes (/api/ai, /api/calendar, /api/email)
│   │   ├── services/             # AI, Email (Resend), and Google Calendar services
│   │   ├── workers/              # Background email worker with retry queue
│   │   └── server.js             # Server startup entrypoint & CORS configuration
│   ├── scripts/                  # Automated test runners and verification scripts
│   ├── .env.example              # Backend environment template (placeholders only)
│   └── package.json
│
├── frontend/                     # React 19 + Vite client application
│   ├── src/
│   │   ├── components/           # Navbar, ProtectedRoute, NotificationCenter, CalendarButton
│   │   ├── context/              # Auth & notification React contexts
│   │   ├── lib/                  # Central API config & Supabase browser client
│   │   ├── pages/                # PatientDashboard, DoctorDashboard, AdminDashboard, Auth
│   │   ├── App.jsx               # Client routing & layout
│   │   └── main.jsx              # DOM entrypoint
│   ├── .env.example              # Frontend environment template (placeholders only)
│   └── package.json
│
├── supabase/
│   └── migrations/               # 18 ordered SQL migration files (Schema, RLS, RPCs, Triggers)
│
└── docs/                         # Comprehensive project documentation
    ├── api.md                    # REST API endpoint documentation
    ├── schema.md                 # Complete database schema, tables, and RLS policies
    ├── llm_prompts.md            # AI prompts, triage rules, and safety guardrails
    ├── google_calendar_setup.md  # Google Cloud Console OAuth 2.0 configuration guide
    └── system_design.md          # System Design document
```

---

## 5. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended).
- **npm**: v9.0.0 or higher.
- **Supabase Account**: Free tier PostgreSQL project with Authentication enabled.
- **Google Cloud Console**: OAuth 2.0 Web Application client ID & Secret.
- **Resend Account**: API key for transactional email delivery.

---

## 6. Environment Variables Reference

### Frontend (`frontend/.env.example`)
*Exposed to the browser via Vite bundle (Never place private secrets here):*
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:5000/api
```

### Backend (`backend/.env.example`)
*Strictly server-side (Never exposed to client bundles):*
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
APP_URL=http://localhost:5173

# Supabase Server Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI / LLM Configuration
OPENAI_API_KEY=your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key

# Transactional Email (Resend)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="MedSync Health <onboarding@resend.dev>"

# Google Calendar OAuth 2.0
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/auth/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events
```

---

## 7. Local Setup & Installation

### Step 1: Database Setup (Supabase)
1. Create a new Supabase project at [supabase.com](https://supabase.com/).
2. In the Supabase SQL Editor, execute the migration files located in `supabase/migrations/` in numerical order (`001_foundation.sql` through `018_cleanup_and_readiness.sql`).
3. In the Supabase Dashboard $\rightarrow$ **Authentication** $\rightarrow$ **URL Configuration**, add `http://localhost:5173` to **Site URL** and **Redirect URLs**.

### Step 2: Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure your Supabase, Resend, and Google OAuth credentials in backend/.env
npm run dev
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
# Configure your Supabase URL and Publishable Key in frontend/.env.local
npm run dev
```

---

## 8. Running Verification Tests

MedSync includes an automated consolidated test runner to verify all system components in a single command:

```bash
cd backend
npm run test:all
```

To run the email delivery test suite:
```bash
cd backend
npm run test:email
```

To run the frontend production build verification:
```bash
cd frontend
npm run build
```

---

## 9. 🔮 Future Scope & Production Roadmap

- **Support for Multiple/Any User Email Accounts**: Configure enterprise domain authentication (DKIM, SPF, DMARC, custom MX records) to enable outbound transactional notifications to any arbitrary public email address.
- **Production-Grade Google OAuth for Arbitrary Users**: Complete Google Cloud OAuth verification to enable Google Calendar synchronization for any authorized public Google account without developer test-list constraints.
- **Custom Production Domain Provisioning**: Procure and configure a dedicated enterprise domain (`https://medsync.health`) with full DNS management, apex redirect rules, and custom SSL termination.
- **Broader Email Delivery Configuration**: Multi-provider email routing fallbacks (e.g., SendGrid, Amazon SES, Postmark) for mission-critical clinic communication.
- **Additional Production Deployment & Security Enhancements**: Database field-level KMS encryption for sensitive PHI, multi-tenant clinic partitioning, and WebAuthn / FIDO2 hardware authentication.

---

## 10. Complete Documentation Index

- [REST API Specification](docs/api.md)
- [Database Schema & RLS Policies](docs/schema.md)
- [LLM Prompts & Clinical Guardrails](docs/llm_prompts.md)
- [Google Calendar OAuth Setup Guide](docs/google_calendar_setup.md)
- [System Design Document](docs/system_design.md)
- [Backend Architecture & Guide](backend/README.md)

---

## ⚠️ Demo & Deployment Limitations

> [!NOTE]
> 1. **Demonstration Project**: The application is currently deployed as an academic and portfolio demonstration project.
> 2. **Email Notifications**: Email delivery (via Resend) is currently configured to work only with the configured developer/test email account because a custom production email domain has not yet been purchased or configured.
> 3. **Google Calendar Integration**: Google Calendar OAuth synchronization is currently in Google Cloud Testing Mode for the configured developer/test Google account and may not work for other unverified users or email accounts.
> 4. **Future Multi-User Support**: Support for arbitrary user email accounts and production-scale email delivery is planned as a future enhancement after configuring a custom domain, production DNS records (SPF/DKIM/DMARC), and full OAuth app verification.
> 5. **Deployment Stack**: The current live deployment operates with a **Vercel frontend** and **Render backend**, backed by **Supabase**.
> 6. **Official Live URL**: The live application can be accessed at [https://medsync-healthcare-appointment-mana.vercel.app/](https://medsync-healthcare-appointment-mana.vercel.app/).
