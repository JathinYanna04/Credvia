-- Migration 014: Resume lifecycle hardening and expanded format support

DO $$
DECLARE
  resumes_constraint_name text;
BEGIN
  -- Find existing parse_status check constraint on public.resumes
  SELECT con.conname
  INTO resumes_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'resumes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%parse_status%';

  -- Drop old constraint if found
  IF resumes_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.resumes DROP CONSTRAINT %I',
      resumes_constraint_name
    );
  END IF;

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
  'image/png',
  'image/jpeg'
]
WHERE id = 'resumes';

CREATE INDEX IF NOT EXISTS idx_resumes_user_status
  ON public.resumes(user_id, parse_status, created_at DESC);
