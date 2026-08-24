# MedSync — Multi-User Google Calendar OAuth 2.0 & Synchronization Architecture

---

## 1. Architecture Overview & Per-User Isolation

MedSync enforces strict **Per-User OAuth 2.0 Isolation** for Google Calendar integration. Every authenticated patient and doctor independently authorizes their own personal or institutional Google account. MedSync never uses global refresh tokens, never hard-codes personal email addresses, and strictly confines client secrets to the server-side backend.

```
+---------------------------------------------------------------------------------+
|                                 MEDSYNC CLIENT                                  |
|         Patient Portal (User A)                  Doctor Portal (User B)         |
|         Connected: reviewer@gmail.com            Connected: doctor@hospital.com |
+------------------------+------------------------------------+-------------------+
                         |                                    |
                         v HTTPS (Supabase Bearer JWT)        v
+------------------------+------------------------------------+-------------------+
|                            MEDSYNC BACKEND REST API                             |
|                                                                                 |
|   • GET  /api/calendar/auth           -> Generates user-bound OAuth consent URL |
|   • GET  /api/calendar/auth/callback  -> Exchanges code, persists per-user token|
|   • GET  /api/calendar/status         -> Returns user connection state & email  |
|   • POST /api/calendar/sync/:id       -> Creates/updates Google Calendar event  |
|   • POST /api/calendar/sync-all       -> Bulk syncs all active appointments     |
|   • POST /api/calendar/disconnect     -> Revokes/clears stored credentials      |
+------------------------+------------------------------------+-------------------+
                         |                                    |
                         v Service Role / Authenticated RLS   v OAuth 2.0 Access
+------------------------+-------------------+    +-----------+-------------------+
|          SUPABASE POSTGRESQL LAYER         |    |     GOOGLE CALENDAR API       |
|                                            |    |                               |
| • public.user_calendar_tokens              |    | • User A Primary Calendar     |
|   (PK: user_id, email, refresh_token)      |    | • User B Primary Calendar     |
| • public.appointment_calendar_events       |    | • Automatic Event Insertion   |
|   (appointment_id, user_id, event_id)      |    | • Automatic Event Deletion    |
+--------------------------------------------+    +-------------------------------+
```

---

## 2. OAuth Sequence & State Association

To prevent cross-account contamination or CSRF attacks:
1. **User Initiation**: The authenticated user clicks **"Connect Google Calendar"** in the top bar or settings.
2. **State Generation**: The backend encodes `userId` and `returnPath` into a base64url JSON state object:
   $$\text{state} = \text{base64url}(\{\text{userId}: \text{auth.uid()}, \text{returnPath}: \text{path}\})$$
3. **Google Consent**: The user is directed to Google's consent screen requesting offline access to `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/userinfo.email`.
4. **Token Exchange & Account Verification**:
   - Google redirects to `/api/calendar/auth/callback?code=...&state=...`.
   - The backend validates `state`, decodes `userId`, and exchanges `code` for an access token and refresh token.
   - The backend calls Google's `oauth2.userinfo.get()` to retrieve the user's authentic Google email address (`google_email`).
5. **Per-User Persistence**:
   - Tokens and the Google account email are upserted to `public.user_calendar_tokens` keyed uniquely by `user_id = stateUserId`.
   - The user is redirected back to MedSync with `?calendar_connected=true`.

---

## 3. Database Schema & Security Policies

### Table 1: `public.user_calendar_tokens`
Stores OAuth 2.0 credentials securely per user:
```sql
CREATE TABLE public.user_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google',
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    scope TEXT,
    google_email TEXT,
    is_connected BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### Table 2: `public.appointment_calendar_events`
Maps MedSync appointment IDs to Google event IDs per user:
```sql
CREATE TABLE public.appointment_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED')),
    html_link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unq_appointment_user_event UNIQUE (appointment_id, user_id)
);
```

### Row-Level Security (RLS) Policies
```sql
ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_calendar_events ENABLE ROW LEVEL SECURITY;

-- Only the owner can view or update their tokens
CREATE POLICY "Users can view own calendar tokens" ON public.user_calendar_tokens
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can view own calendar events" ON public.appointment_calendar_events
    FOR SELECT TO authenticated USING (user_id = auth.uid());
```

---

## 4. Lifecycle Event Management

### 1. Appointment Booking
- When a patient books an appointment, the backend identifies the booking participants (`patient_id` and `doctor_id`).
- If the patient has connected their Google Calendar, an event is created in the patient's primary calendar (`calendar.events.insert`) with popup reminders (24h and 2h prior).
- If the doctor has also connected their Google Calendar, an independent event is created in the doctor's calendar.
- The Google Event ID is saved in `public.appointment_calendar_events`.
- **Non-blocking Resilience**: If Google's API fails or the user is not connected, the appointment booking in MedSync succeeds uninterrupted.

### 2. Rescheduling
- When appointment time changes, the backend retrieves `google_event_id` from `public.appointment_calendar_events`.
- Calls `calendar.events.patch()` to update start and end times in the user's primary calendar.
- No duplicate events are created.

### 3. Cancellation
- When an appointment is cancelled, the backend retrieves `google_event_id` and invokes `calendar.events.delete()`.
- Marks the mapping status as `CANCELLED` in `public.appointment_calendar_events`.

### 4. Disconnection
- When a user clicks **"Disconnect"**, the backend invalidates local OAuth tokens and sets `is_connected = false` in `public.user_calendar_tokens`.
- Existing MedSync appointments and medical records remain completely intact.

---

## 5. Automatic Token Refresh

Google access tokens expire after 1 hour (3600 seconds). MedSync uses the `googleapis` event listener `oauth2Client.on('tokens')`:
```javascript
oauth2Client.on('tokens', async (newTokens) => {
  const updatePayload = {
    access_token: newTokens.access_token,
    expiry_date: newTokens.expiry_date,
    updated_at: new Date().toISOString(),
  };
  if (newTokens.refresh_token) {
    updatePayload.refresh_token = newTokens.refresh_token;
  }
  await supabaseAdmin
    .from('user_calendar_tokens')
    .update(updatePayload)
    .eq('user_id', userId);
});
```
When an access token expires, the client transparently refreshes the token on the next request using the stored `refresh_token` and updates PostgreSQL.

---

## 6. Reviewer Testing Instructions

To evaluate per-user Google Calendar integration with any Google account:
1. **Register & Log In**: Create a new patient or doctor account with any email.
2. **Open Calendar Controls**: Look at the top bar header or settings widget.
3. **Click "Connect Google Calendar"**: Authorize your personal or test Google account on Google's consent screen.
4. **Inspect Connection**: Notice the connected account email (`reviewer@gmail.com`) displayed in the badge.
5. **Book an Appointment**: Book a consultation with any available doctor.
6. **Verify Google Calendar**: Open [Google Calendar](https://calendar.google.com) and observe the newly inserted MedSync consultation event with doctor/patient details.
7. **Test Disconnect**: Click **"Disconnect"** in MedSync and verify the connection is revoked while appointments remain safe in MedSync.
