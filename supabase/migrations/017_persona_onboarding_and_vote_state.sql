-- Migration 017: Persona-based onboarding profile fields and safer legacy account mapping

ALTER TABLE public.users
  ALTER COLUMN account_type DROP NOT NULL,
  ALTER COLUMN account_type DROP DEFAULT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_persona TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_primary_persona_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_primary_persona_check
      CHECK (
        primary_persona IS NULL
        OR primary_persona IN (
          'student',
          'job_seeker',
          'professional',
          'recruiter',
          'founder',
          'mentor'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_primary_persona
  ON public.profiles(primary_persona);

UPDATE public.users
SET account_type = CASE
  WHEN lower(account_type) IN ('student', 'job_seeker', 'professional', 'recruiter', 'founder', 'mentor')
    THEN lower(account_type)
  ELSE NULL
END;

UPDATE public.profiles AS p
SET
  primary_persona = COALESCE(
    p.primary_persona,
    CASE
      WHEN lower(u.account_type) IN ('student', 'job_seeker', 'professional', 'recruiter', 'founder', 'mentor')
        THEN lower(u.account_type)
      ELSE NULL
    END
  ),
  onboarding_completed_at = CASE
    WHEN p.onboarding_complete AND p.onboarding_completed_at IS NULL
      THEN COALESCE(p.updated_at, p.created_at, NOW())
    ELSE p.onboarding_completed_at
  END
FROM public.users AS u
WHERE u.id = p.user_id;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  generated_username TEXT;
  derived_account_type TEXT;
BEGIN
  derived_account_type := CASE
    WHEN lower(COALESCE(NEW.raw_user_meta_data->>'account_type', '')) IN ('student', 'job_seeker', 'professional', 'recruiter', 'founder', 'mentor')
      THEN lower(NEW.raw_user_meta_data->>'account_type')
    ELSE NULL
  END;

  INSERT INTO public.users (id, email, auth_provider, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    derived_account_type
  )
  ON CONFLICT (id) DO NOTHING;

  base_username := lower(regexp_replace(split_part(COALESCE(NEW.email, 'builder'), '@', 1), '[^a-z0-9_]+', '', 'g'));

  IF length(base_username) < 3 THEN
    base_username := 'builder';
  END IF;

  generated_username := left(base_username || '_' || substring(replace(NEW.id::text, '-', '') from 1 for 8), 30);

  INSERT INTO public.profiles (
    user_id,
    username,
    full_name,
    primary_persona,
    onboarding_complete
  )
  VALUES (
    NEW.id,
    generated_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    derived_account_type,
    FALSE
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
