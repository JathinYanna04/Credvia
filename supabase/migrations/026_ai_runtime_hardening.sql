-- Migration 026: AI runtime hardening for deterministic lifecycle, worker leasing, and idempotent run identity

ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS prompt_key TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS run_identity TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS processor_id TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES public.ai_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS output_checksum TEXT,
  ADD COLUMN IF NOT EXISTS completed_reason TEXT;

UPDATE public.ai_runs
SET prompt_key = COALESCE(NULLIF(prompt_key, ''), feature || ':' || prompt_version)
WHERE prompt_key = 'default' OR prompt_key IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_status_check'
      AND conrelid = 'public.ai_runs'::regclass
  ) THEN
    ALTER TABLE public.ai_runs
      DROP CONSTRAINT ai_runs_status_check;
  END IF;
END $$;

ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));

CREATE INDEX IF NOT EXISTS idx_ai_runs_claimable
  ON public.ai_runs(status, next_retry_at, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_runs_processor_running
  ON public.ai_runs(processor_id, lease_token, status)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_ai_runs_identity_success
  ON public.ai_runs(requested_by, run_identity, completed_at DESC)
  WHERE status = 'succeeded' AND run_identity IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_ai_runs(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 5,
  p_lease_seconds INTEGER DEFAULT 45,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS SETOF public.ai_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
    FROM public.ai_runs r
    WHERE (
      (
        r.status = 'queued'
        AND COALESCE(r.next_retry_at, r.created_at) <= NOW()
      )
      OR (
        r.status = 'running'
        AND (
          (r.lease_expires_at IS NOT NULL AND r.lease_expires_at <= NOW())
          OR (r.timeout_at IS NOT NULL AND r.timeout_at <= NOW())
        )
      )
    )
    AND r.attempt_count < LEAST(COALESCE(r.max_attempts, p_max_attempts), p_max_attempts)
    ORDER BY r.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 5), 100))
  ),
  updated AS (
    UPDATE public.ai_runs r
    SET
      status = 'running',
      started_at = COALESCE(r.started_at, NOW()),
      completed_at = NULL,
      failed_at = NULL,
      error_code = NULL,
      error_message = NULL,
      completed_reason = NULL,
      processor_id = p_worker_id,
      lease_token = extensions.uuid_generate_v4(),
      lease_expires_at = NOW() + make_interval(secs => GREATEST(10, LEAST(COALESCE(p_lease_seconds, 45), 600))),
      timeout_at = NOW() + make_interval(secs => GREATEST(20, LEAST(COALESCE(p_lease_seconds, 45) * 2, 1200))),
      last_heartbeat_at = NOW(),
      attempt_count = r.attempt_count + 1,
      next_retry_at = NOW()
    FROM candidates c
    WHERE r.id = c.id
    RETURNING r.*
  )
  SELECT * FROM updated;
END;
$$;
