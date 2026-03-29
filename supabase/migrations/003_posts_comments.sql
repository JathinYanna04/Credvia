-- Migration 003: Posts and Comments
CREATE TABLE public.posts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  community_id          UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  post_type             TEXT NOT NULL, -- 'question' | 'discussion' | 'project_showcase' | 'resource' | 'opportunity' | 'resume_review' | 'looking_for_collaborator'
  title                 TEXT NOT NULL,
  body_md               TEXT,
  body_html             TEXT,
  status                TEXT NOT NULL DEFAULT 'published', -- 'published' | 'hidden' | 'removed' | 'deleted'
  external_url          TEXT,
  media_url             TEXT,
  comment_count         INT NOT NULL DEFAULT 0,
  vote_score            INT NOT NULL DEFAULT 0,
  save_count            INT NOT NULL DEFAULT 0,
  view_count            INT NOT NULL DEFAULT 0,
  best_answer_comment_id UUID, -- set after FK for comments is created
  is_answered           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.post_tags (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE public.comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  body_md           TEXT NOT NULL,
  body_html         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'published', -- 'published' | 'hidden' | 'removed' | 'deleted'
  vote_score        INT NOT NULL DEFAULT 0,
  is_best_answer    BOOLEAN NOT NULL DEFAULT FALSE,
  depth             INT NOT NULL DEFAULT 0, -- 0 = top-level, increments per nesting
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add best_answer FK now that comments table exists
ALTER TABLE public.posts ADD CONSTRAINT fk_best_answer
  FOREIGN KEY (best_answer_comment_id) REFERENCES public.comments(id) ON DELETE SET NULL;

-- Full-text search for posts
ALTER TABLE public.posts ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_md,''))
  ) STORED;
CREATE INDEX idx_posts_search ON public.posts USING GIN(search_vector);
CREATE INDEX idx_posts_author ON public.posts(author_id);
CREATE INDEX idx_posts_community ON public.posts(community_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX idx_posts_vote_score ON public.posts(vote_score DESC);
CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_author_id ON public.comments(author_id);
CREATE INDEX idx_comments_parent ON public.comments(parent_comment_id);
