-- Migration 029: strict AI run claimability state machine and failed-run reset

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
    WHERE r.status = 'queued'
      AND r.attempt_count < r.max_attempts
      AND (
        r.lease_expires_at IS NULL
        OR r.lease_expires_at < NOW()
      )
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

CREATE OR REPLACE FUNCTION public.get_ai_run_claimability_metrics()
RETURNS TABLE (
  total_queued BIGINT,
  filtered_by_attempts BIGINT,
  filtered_by_lease BIGINT,
  eligible BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH queued AS (
    SELECT
      attempt_count,
      max_attempts,
      lease_expires_at
    FROM public.ai_runs
    WHERE status = 'queued'
  )
  SELECT
    COUNT(*)::BIGINT AS total_queued,
    COUNT(*) FILTER (WHERE attempt_count >= max_attempts)::BIGINT AS filtered_by_attempts,
    COUNT(*) FILTER (
      WHERE attempt_count < max_attempts
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at >= NOW()
    )::BIGINT AS filtered_by_lease,
    COUNT(*) FILTER (
      WHERE attempt_count < max_attempts
        AND (
          lease_expires_at IS NULL
          OR lease_expires_at < NOW()
        )
    )::BIGINT AS eligible
  FROM queued;
$$;

UPDATE public.ai_runs
SET
  status = 'queued',
  attempt_count = 0,
  lease_expires_at = NULL,
  lease_token = NULL,
  processor_id = NULL,
  started_at = NULL,
  completed_at = NULL,
  failed_at = NULL,
  next_retry_at = NOW(),
  error_code = NULL,
  error_message = NULL,
  completed_reason = NULL
WHERE status = 'failed';
