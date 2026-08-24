# MedSync Healthcare Appointment & Follow-up Manager

MedSync is a production-grade healthcare management and clinical workflow platform designed to streamline doctor-patient appointments, pre-visit symptom intake, AI clinical triage, digital e-prescriptions, automated medication schedules, and bidirectional Google Calendar synchronization.

---
<img width="937" height="476" alt="image" src="https://github.com/user-attachments/assets/42a6a377-6c03-44e4-b68c-7d2a070608cc" />

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
- <img width="926" height="482" alt="image" src="https://github.com/user-attachments/assets/3ded09be-7f4e-4830-824c-0ce10e5a1789" />


### Doctor Portal
- **Clinical Schedule Management**: Configure weekly working hours and schedule leaves with automated patient conflict resolution.
- **Appointment Queue**: Real-time list of upcoming, in-progress, and past patient consultations.
- **Pre-Visit AI Briefing**: Review patient intake triage urgency (`Low`, `Medium`, `High`) and 3 clinical probe questions before starting visits.
- **Consultation Notes & E-Prescriptions**: Document SOAP clinical notes and write multi-item digital prescriptions with dosages, frequencies, and instructions.
- <img width="918" height="471" alt="image" src="https://github.com/user-attachments/assets/0166ee4e-b8ec-4308-a25c-1e51c2462ab1" />


### Administrator Console
- **System Monitoring**: View total appointments, active physicians, and platform metrics.
- **Doctor Directory Management**: Approve and manage physician profiles.
<img width="926" height="491" alt="image" src="https://github.com/user-attachments/assets/97dfff81-1227-4c50-a0cc-060202a84e9a" />

---

## 3. Technology Stack

- **Frontend**: React 19, Vite, Vanilla CSS Design System, Lucide Icons.
- **Backend**: Node.js, Express, ES Modules, `dotenv`, `cors`.
- **Database & Auth**: Supabase PostgreSQL, Row-Level Security (RLS), Remote Procedure Calls (RPCs), PostgreSQL Triggers.
- **AI / LLMs**: OpenAI (`gpt-4o-mini`) / Google Gemini (`gemini-1.5-flash`) with deterministic rule-based fallbacks.
- **Transactional Email**: Resend API with background queue worker (`FOR UPDATE SKIP LOCKED`).
- **Calendar Integration**: Google Calendar API (OAuth 2.0).

---

## 4. Architecture Diagram

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

## 5. Project Structure

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
│   │   ├── app.js                # Express application setup
│   │   └── server.js             # Server startup entrypoint
│   ├── scripts/                  # Automated test runners and verification scripts
│   ├── .env.example              # Backend environment template
│   └── package.json
│
├── frontend/                     # React 19 + Vite client application
│   ├── src/
│   │   ├── components/           # Navbar, ProtectedRoute, NotificationCenter, CalendarButton
│   │   ├── context/              # Auth & notification React contexts
│   │   ├── lib/                  # Supabase browser client
│   │   ├── pages/                # PatientDashboard, DoctorDashboard, AdminDashboard, Auth
│   │   ├── App.jsx               # Client routing & layout
│   │   └── main.jsx              # DOM entrypoint
│   ├── .env.example              # Frontend environment template
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
    └── system_design.md          # 800-word System Design document
```

---

## 6. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended).
- **npm**: v9.0.0 or higher.
- **Supabase Account**: Free tier PostgreSQL project.
- **Google Cloud Console**: OAuth 2.0 Web Application client (for Calendar integration).
- **Resend Account**: Free tier API key (for transactional email delivery).

---

## 7. Environment Variables

### Frontend (`frontend/.env`)
*Exposed to the browser via Vite bundle (Never place private secrets here):*
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:5000/api
```

### Backend (`backend/.env`)
*Strictly server-side (Never exposed to client bundles):*
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Supabase Server Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI / LLM Configuration (Optional, fallback active)
OPENAI_API_KEY=your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key

# Transactional Email (Resend)
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM="MedSync Health <onboarding@resend.dev>"
APP_URL=http://localhost:5173

# Google Calendar OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/auth/callback
```

---

## 8. Installation & Setup

### Step 1: Database Setup (Supabase)
1. Create a new Supabase project.
2. In the Supabase SQL Editor, execute the migrations located in `supabase/migrations/` in numerical order (from `001_foundation.sql` to `017_doctor_leave_cancellation_notifications.sql`), or execute `014_consolidated_production_fix.sql`.
3. In Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ URL Configuration, add `http://localhost:5173` to **Site URL** and **Redirect URLs**.

### Step 2: Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Supabase, Resend, and Google OAuth credentials
npm run dev
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your Supabase URL and Anon Key
npm run dev
```

---

## 9. Running Verification Tests

MedSync includes an automated consolidated test runner to verify all system components in a single command:

```bash
cd backend
node scripts/run_all_tests.js
```

To run the frontend production build verification:
```bash
cd frontend
npm run build
```

---

## 10. Complete Documentation Index

- [REST API Specification](docs/api.md)
- [Database Schema & RLS Policies](docs/schema.md)
- [LLM Prompts & Clinical Guardrails](docs/llm_prompts.md)
- [Google Calendar OAuth Setup Guide](docs/google_calendar_setup.md)
- [System Design Document](docs/system_design.md)
- [Backend Architecture & Guide](backend/README.md)
