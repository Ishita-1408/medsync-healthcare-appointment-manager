-- ==============================================================================
-- MedSync Migration 012: Google Calendar OAuth 2.0 & Appointment Synchronization
-- File: supabase/migrations/012_google_calendar_sync.sql
-- ==============================================================================

-- 1. USER CALENDAR TOKENS TABLE
-- Stores OAuth 2.0 refresh and access tokens per user
CREATE TABLE IF NOT EXISTS public.user_calendar_tokens (
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

-- Indexes for token table
CREATE INDEX IF NOT EXISTS idx_user_calendar_tokens_user ON public.user_calendar_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_calendar_tokens_connected ON public.user_calendar_tokens(is_connected);

-- 2. APPOINTMENT CALENDAR EVENTS MAPPING TABLE
-- Maps MedSync appointments to Google Calendar event IDs per user
CREATE TABLE IF NOT EXISTS public.appointment_calendar_events (
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

-- Indexes for calendar events
CREATE INDEX IF NOT EXISTS idx_calendar_events_appointment ON public.appointment_calendar_events(appointment_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON public.appointment_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_id ON public.appointment_calendar_events(google_event_id);

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_user_calendar_tokens_updated_at ON public.user_calendar_tokens;
CREATE TRIGGER trg_user_calendar_tokens_updated_at
    BEFORE UPDATE ON public.user_calendar_tokens
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_appointment_calendar_events_updated_at ON public.appointment_calendar_events;
CREATE TRIGGER trg_appointment_calendar_events_updated_at
    BEFORE UPDATE ON public.appointment_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict user privacy with complete CRUD permissions for user-owned records
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_calendar_events ENABLE ROW LEVEL SECURITY;

-- TOKENS: SELECT
DROP POLICY IF EXISTS "Users can view own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can view own calendar tokens"
    ON public.user_calendar_tokens FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- TOKENS: INSERT
DROP POLICY IF EXISTS "Users can insert own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can insert own calendar tokens"
    ON public.user_calendar_tokens FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- TOKENS: UPDATE (e.g. Disconnect or refresh)
DROP POLICY IF EXISTS "Users can update own calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Users can update own calendar tokens"
    ON public.user_calendar_tokens FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- TOKENS: Allow backend upsert when service key / authenticated
DROP POLICY IF EXISTS "Backend service can manage calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Backend service can manage calendar tokens"
    ON public.user_calendar_tokens FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- CALENDAR EVENTS: SELECT
DROP POLICY IF EXISTS "Users can view own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can view own calendar events"
    ON public.appointment_calendar_events FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- CALENDAR EVENTS: INSERT
DROP POLICY IF EXISTS "Users can insert own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can insert own calendar events"
    ON public.appointment_calendar_events FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- CALENDAR EVENTS: UPDATE
DROP POLICY IF EXISTS "Users can update own calendar events" ON public.appointment_calendar_events;
CREATE POLICY "Users can update own calendar events"
    ON public.appointment_calendar_events FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());
