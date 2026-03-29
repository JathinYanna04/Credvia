-- Migration 002: Communities
CREATE TABLE public.communities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  rules_md    TEXT,
  icon_url    TEXT,
  banner_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived' | 'private'
  member_count INT NOT NULL DEFAULT 0,
  post_count   INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]{2,50}$')
);

CREATE TABLE public.community_memberships (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member', -- 'member' | 'moderator' | 'admin'
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);

CREATE TABLE public.tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  post_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.community_tags (
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (community_id, tag_id)
);

-- Full-text search for communities
ALTER TABLE public.communities ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
  ) STORED;
CREATE INDEX idx_communities_search ON public.communities USING GIN(search_vector);
CREATE INDEX idx_communities_slug ON public.communities(slug);
CREATE INDEX idx_community_memberships_user ON public.community_memberships(user_id);
CREATE INDEX idx_community_memberships_community ON public.community_memberships(community_id);
