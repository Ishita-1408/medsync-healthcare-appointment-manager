# MedSync API Backend

Secure Node.js + Express backend service for the **MedSync Healthcare Appointment & Follow-up Manager**.

## Architecture Responsibilities
- **AI / LLM Clinical Summarization Pipeline** (Pre-visit intake urgency/questions, Post-visit patient-friendly care plans).
- **Email Delivery Service** (Booking confirmations, reminders, cancellations via Resend / SMTP).
- **Google Calendar Synchronization** (OAuth 2.0 token management, event creation, update, and cancellation sync).
- **Protected Secrets Management** (Keeping AI API keys, Google OAuth client secrets, and email credentials completely isolated from client bundles).

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your configuration:
- `PORT`: Server listening port (default: `5000`)
- `CLIENT_URL`: Allowed frontend origin (e.g. `http://localhost:5173`)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role secret (server-side only)
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: API keys for LLM clinical workflows
- `RESEND_API_KEY`: API key for email delivery
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: OAuth 2.0 credentials

### 3. Run Locally
```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start
```

### 4. Health Check
```bash
curl http://localhost:5000/api/health
```
