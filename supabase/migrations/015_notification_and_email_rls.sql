-- ==============================================================================
-- MedSync Migration 015: Notification & Email Jobs RLS & Failure Handling
-- File: supabase/migrations/015_notification_and_email_rls.sql
-- ==============================================================================

-- 1. NOTIFICATIONS TABLE POLICIES
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Backend service can manage notifications" ON public.notifications;
CREATE POLICY "Backend service can manage notifications"
    ON public.notifications FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. EMAIL JOBS TABLE POLICIES
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own email jobs" ON public.email_jobs;
CREATE POLICY "Users can view own email jobs"
    ON public.email_jobs FOR SELECT
    TO authenticated
    USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Backend service can manage email jobs" ON public.email_jobs;
CREATE POLICY "Backend service can manage email jobs"
    ON public.email_jobs FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. SECURE CLAIM NEXT EMAIL JOB RPC
CREATE OR REPLACE FUNCTION public.claim_next_email_job(p_worker_id TEXT)
RETURNS SETOF public.email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    WITH candidate AS (
        SELECT id
        FROM public.email_jobs
        WHERE (
            (status IN ('PENDING', 'RETRY') AND next_retry_at <= timezone('utc'::text, now()))
            OR
            (status = 'PROCESSING' AND locked_at < timezone('utc'::text, now()) - INTERVAL '5 minutes')
        )
        ORDER BY next_retry_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_jobs e
    SET status = 'PROCESSING',
        locked_at = timezone('utc'::text, now()),
        locked_by = p_worker_id,
        updated_at = timezone('utc'::text, now())
    FROM candidate
    WHERE e.id = candidate.id
    RETURNING e.*;
END;
$$;
