-- Migration 027: Moderation AI override audit logging

CREATE TABLE IF NOT EXISTS public.moderation_ai_overrides (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES public.moderation_ai_reviews(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  moderator_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  suggested_action TEXT NOT NULL,
  selected_action TEXT NOT NULL,
  override_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_ai_overrides_report_created
  ON public.moderation_ai_overrides(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_ai_overrides_moderator_created
  ON public.moderation_ai_overrides(moderator_user_id, created_at DESC);

ALTER TABLE public.moderation_ai_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moderation_ai_overrides: moderator read" ON public.moderation_ai_overrides;
CREATE POLICY "moderation_ai_overrides: moderator read"
  ON public.moderation_ai_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_memberships
      WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "moderation_ai_overrides: moderator insert" ON public.moderation_ai_overrides;
CREATE POLICY "moderation_ai_overrides: moderator insert"
  ON public.moderation_ai_overrides
  FOR INSERT
  WITH CHECK (
    moderator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_memberships
      WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin')
    )
  );
