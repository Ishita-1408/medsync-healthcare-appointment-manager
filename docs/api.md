# MedSync REST API & Backend Architecture Documentation

## 1. Overview & Architecture
The **MedSync API Backend** provides secure server-side execution for AI clinical summarization, background transactional email dispatch, and third-party integrations, ensuring all private secrets (API keys, OAuth tokens) remain strictly isolated from client-side bundles.

---

## 2. Authentication
All private endpoints require an `Authorization: Bearer <SUPABASE_JWT_TOKEN>` header.
- Handled by `backend/src/middleware/auth.js` via Supabase Auth session verification.

---

## 3. Endpoints

### A. Health & Status
- **`GET /api/health`**
  - **Access**: Public
  - **Description**: Returns server uptime, environment, and health status.
  - **Response**:
    ```json
    {
      "status": "healthy",
      "service": "MedSync API Backend",
      "timestamp": "2026-08-23T13:58:00Z",
      "uptimeSeconds": 142,
      "environment": "development"
    }
    ```

---

### B. AI Clinical Summarization

#### 1. Pre-Visit Symptom Summary & Triage
- **`POST /api/ai/pre-visit-summary`**
  - **Access**: Private (Authenticated Patient or Doctor)
  - **Body**:
    ```json
    {
      "appointment_id": "UUID",
      "force_regenerate": false
    }
    ```
  - **Response**:
    ```json
    {
      "success": true,
      "cached": true,
      "data": {
        "id": "UUID",
        "appointment_id": "UUID",
        "urgency": "Medium",
        "chief_complaint": "Persistent Migraine",
        "suggested_questions": [
          "When did the headaches first begin?",
          "Are you experiencing visual auras or sensitivity to light?",
          "Have over-the-counter painkillers helped?"
        ],
        "model_used": "gpt-4o-mini",
        "created_at": "2026-08-23T13:50:00Z"
      }
    }
    ```

#### 2. Post-Visit Patient-Friendly Care Summary
- **`POST /api/ai/post-visit-summary`**
  - **Access**: Private (Authenticated Patient or Doctor)
  - **Body**:
    ```json
    {
      "appointment_id": "UUID",
      "force_regenerate": false
    }
    ```
  - **Response**:
    ```json
    {
      "success": true,
      "cached": false,
      "data": {
        "id": "UUID",
        "appointment_id": "UUID",
        "summary": "During your consultation today, Dr. assessed your condition...",
        "diagnosis_explanation": "You were diagnosed with Acute Bronchitis...",
        "medications": [
          {
            "name": "Amoxicillin",
            "strength": "500mg",
            "dosage": "1 capsule",
            "frequency": "Three times daily",
            "route": "Oral",
            "duration": "7 days",
            "instructions": "Take after meals"
          }
        ],
        "follow_up": {
          "instructions": "Get plenty of rest. Follow up if symptoms worsen.",
          "date": "2026-09-01"
        },
        "model_used": "gpt-4o-mini",
        "created_at": "2026-08-23T13:52:00Z"
      }
    }
    ```

---

### C. Transactional Email System

#### 1. Email Job Status
- **`GET /api/email/status/:jobId`**
  - **Access**: Private (Authenticated Recipient)
  - **Description**: Returns delivery status, attempt counts, and timestamps for an email job.
  - **Response**:
    ```json
    {
      "success": true,
      "data": {
        "id": "UUID",
        "appointment_id": "UUID",
        "recipient_id": "UUID",
        "email_type": "BOOKING_CONFIRMATION",
        "subject": "Your MedSync Appointment is Confirmed — Dr. Smith",
        "status": "SENT",
        "attempts": 1,
        "sent_at": "2026-08-23T13:58:05Z",
        "created_at": "2026-08-23T13:58:00Z"
      }
    }
    ```

---

## 4. Background Email Worker & Retry Lifecycle

```
[Appointment Event] (DB Trigger)
        ↓
[email_jobs Record] (Status: PENDING)
        ↓
[claim_next_email_job()] (FOR UPDATE SKIP LOCKED → Status: PROCESSING)
        ↓
[emailService.sendEmail()]
     /         \
 (Success)   (Failure)
   /             \
[Status: SENT]  [Attempts < 5?]
                 /         \
             (Yes)         (No)
              /               \
       [Status: RETRY]    [Status: FAILED]
       (Exp. Backoff)
```

### Exponential Backoff Intervals
- Attempt 1 $\rightarrow$ Immediate / next cycle
- Attempt 2 $\rightarrow$ 1 minute delay
- Attempt 3 $\rightarrow$ 5 minutes delay
- Attempt 4 $\rightarrow$ 15 minutes delay
- Attempt 5 $\rightarrow$ 1 hour delay
- Max attempts $\ge 5 \rightarrow$ Marked permanently `FAILED`
