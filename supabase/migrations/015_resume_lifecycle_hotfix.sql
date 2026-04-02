-- Migration 015: Resume lifecycle hotfix for already-applied 014 environments

DO $$
DECLARE
  resumes_constraint_name text;
BEGIN
  -- Drop all parse_status check constraints so we can recreate the canonical one.
  FOR resumes_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'resumes'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%parse_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.resumes DROP CONSTRAINT %I',
      resumes_constraint_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resumes'
      AND column_name = 'parse_status'
  ) THEN
    UPDATE public.resumes
    SET parse_status = CASE lower(parse_status)
      WHEN 'uploaded' THEN 'UPLOADED'
      WHEN 'processing' THEN 'EXTRACTING'
      WHEN 'ready' THEN 'READY'
      WHEN 'parsing' THEN 'ANALYZING'
      WHEN 'parsed' THEN 'ANALYZED'
      WHEN 'extracted_with_warnings' THEN 'EXTRACTED_WITH_WARNINGS'
      WHEN 'failed' THEN 'ANALYSIS_FAILED'
      ELSE upper(parse_status)
    END;

    ALTER TABLE public.resumes
      ALTER COLUMN parse_status SET DEFAULT 'UPLOADED';

    ALTER TABLE public.resumes
      ADD CONSTRAINT resumes_parse_status_check
      CHECK (
        parse_status IN (
          'UPLOADED',
          'EXTRACTING',
          'EXTRACTED',
          'EXTRACTED_WITH_WARNINGS',
          'PARSED',
          'READY',
          'ANALYZING',
          'ANALYZED',
          'EXTRACTION_FAILED',
          'PARSING_FAILED',
          'ANALYSIS_FAILED'
        )
      );
  END IF;
END $$;

-- Ensure exactly one active resume per user at the database layer.
UPDATE public.resumes current_resume
SET is_active = false
WHERE current_resume.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.resumes newer_resume
    WHERE newer_resume.user_id = current_resume.user_id
      AND newer_resume.is_active = true
      AND (
        newer_resume.created_at > current_resume.created_at
        OR (
          newer_resume.created_at = current_resume.created_at
          AND newer_resume.id::text > current_resume.id::text
        )
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_single_active_per_user
  ON public.resumes(user_id)
  WHERE is_active = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resume_analysis_runs'
      AND column_name = 'status'
  ) THEN
    UPDATE public.resume_analysis_runs
    SET status = CASE lower(status)
      WHEN 'queued' THEN 'extracting'
      WHEN 'processing' THEN 'extracting'
      WHEN 'running' THEN 'analyzing'
      ELSE lower(status)
    END;
  END IF;
END $$;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
  'application/x-rtf',
  'image/png',
  'image/jpeg'
]
WHERE id = 'resumes';

CREATE INDEX IF NOT EXISTS idx_resumes_user_status
  ON public.resumes(user_id, parse_status, created_at DESC);
