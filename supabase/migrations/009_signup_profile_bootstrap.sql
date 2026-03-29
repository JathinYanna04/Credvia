-- Migration 009: Ensure auth signup bootstraps both users and profiles

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  generated_username TEXT;
BEGIN
  INSERT INTO public.users (id, email, auth_provider)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'provider', 'email'))
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
    onboarding_complete
  )
  VALUES (
    NEW.id,
    generated_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    FALSE
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
