-- Migration 001: Core Identity
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- users: extends auth.users (Supabase Auth)
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  auth_provider TEXT NOT NULL DEFAULT 'email', -- 'email' | 'google'
  account_type  TEXT NOT NULL DEFAULT 'student', -- 'student' | 'professional' | 'recruiter' | 'founder' | 'mentor'
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'deleted'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.profiles (
  user_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username            TEXT NOT NULL UNIQUE,
  full_name           TEXT,
  headline            TEXT,
  bio                 TEXT,
  avatar_url          TEXT,
  location            TEXT,
  current_company     TEXT,
  education           TEXT,
  profile_visibility  JSONB NOT NULL DEFAULT '{"email": false, "location": true, "education": true}'::jsonb,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]{3,30}$')
);

CREATE TABLE public.profile_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  link_type   TEXT NOT NULL, -- 'github' | 'linkedin' | 'portfolio' | 'website' | 'resume' | 'other'
  url         TEXT NOT NULL,
  label       TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.skills (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_skills (
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id          UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency_level TEXT, -- 'beginner' | 'intermediate' | 'advanced'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, skill_id)
);

-- Indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profile_links_user_id ON public.profile_links(user_id);
CREATE INDEX idx_user_skills_user_id ON public.user_skills(user_id);

-- Full-text search vector for profiles
ALTER TABLE public.profiles ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(username,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(bio,''))
  ) STORED;
CREATE INDEX idx_profiles_search ON public.profiles USING GIN(search_vector);
