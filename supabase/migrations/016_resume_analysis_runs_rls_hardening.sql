-- Migration 016: Harden resume_analysis_runs access for service-role orchestration

ALTER TABLE public.resume_analysis_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name text;
BEGIN
  -- Remove existing policies to avoid mixed insert/update permissions from prior revisions.
  FOR policy_name IN
    SELECT pol.polname
    FROM pg_policy pol
    JOIN pg_class rel ON rel.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'resume_analysis_runs'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.resume_analysis_runs',
      policy_name
    );
  END LOOP;
END $$;

-- Authenticated users can read only runs tied to resumes they own.
CREATE POLICY "resume_analysis_runs: owner read"
  ON public.resume_analysis_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.resumes
      WHERE resumes.id = resume_analysis_runs.resume_id
        AND resumes.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy is created for authenticated users.
-- Server-side orchestration writes use the service-role client after ownership validation.
