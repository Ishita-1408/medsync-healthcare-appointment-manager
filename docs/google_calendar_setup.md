# Google Calendar API & OAuth 2.0 Setup Guide

This guide details the step-by-step process for configuring Google Calendar OAuth 2.0 integration in MedSync.

---

## 1. Create a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** $\rightarrow$ **New Project**.
3. Enter Project Name: `MedSync Healthcare` and click **Create**.

---

## 2. Enable Google Calendar API
1. In the Google Cloud Console, navigate to **APIs & Services** $\rightarrow$ **Library**.
2. Search for **Google Calendar API**.
3. Click on **Google Calendar API** and select **Enable**.

---

## 3. Configure OAuth Consent Screen
1. Go to **APIs & Services** $\rightarrow$ **OAuth consent screen**.
2. Select User Type: **External** (or Internal if using Google Workspace) and click **Create**.
3. Fill in App Information:
   - **App name**: `MedSync`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Under **Scopes**, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/calendar.events` (Manage calendar events)
   - `https://www.googleapis.com/auth/userinfo.email` (See primary email address)
5. Under **Test Users**, add the Google email addresses of doctors/patients testing the application while in testing mode.
6. Click **Save and Continue**.

---

## 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services** $\rightarrow$ **Credentials**.
2. Click **Create Credentials** $\rightarrow$ **OAuth client ID**.
3. Select **Application type**: `Web application`.
4. Name: `MedSync Web Server`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5000`
   - `http://localhost:5173`
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:5000/api/calendar/auth/callback`
   - *(For production deployment: `https://your-backend-service.onrender.com/api/calendar/auth/callback`)*
7. Click **Create**.
8. Copy the generated **Client ID** and **Client Secret**.

---

## 5. Configure Backend Environment
Add the credentials to `backend/.env`:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/auth/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events
```

---

## 6. Verification & Event Lifecycle
- **Connect**: In the Patient or Doctor Portal, clicking **Connect Google Calendar** redirects the user to Google's consent screen.
- **Offline Access & Refresh Token**: MedSync requests `access_type: 'offline'`, ensuring a long-lived `refresh_token` is stored in `public.user_calendar_tokens`.
- **Automatic Token Refresh**: The backend automatically refreshes expired access tokens without prompting the user again.
- **Event Creation**: When an appointment is booked, a Google Calendar event with popup reminders (24 hours and 2 hours prior) is created asynchronously.
- **Reschedule**: When start/end time changes, the Google Calendar event is patched automatically.
- **Cancel**: When an appointment is cancelled, the Google Calendar event is deleted from the user's primary calendar.
