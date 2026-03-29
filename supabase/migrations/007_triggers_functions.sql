-- Migration 007: Triggers and Functions

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Maintain posts.comment_count
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- Maintain posts.vote_score and comments.vote_score
CREATE OR REPLACE FUNCTION update_vote_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entity_type = 'post' THEN
      UPDATE public.posts SET vote_score = vote_score + NEW.value WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'comment' THEN
      UPDATE public.comments SET vote_score = vote_score + NEW.value WHERE id = NEW.entity_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.entity_type = 'post' THEN
      UPDATE public.posts SET vote_score = vote_score + (NEW.value - OLD.value) WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'comment' THEN
      UPDATE public.comments SET vote_score = vote_score + (NEW.value - OLD.value) WHERE id = NEW.entity_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.entity_type = 'post' THEN
      UPDATE public.posts SET vote_score = vote_score - OLD.value WHERE id = OLD.entity_id;
    ELSIF OLD.entity_type = 'comment' THEN
      UPDATE public.comments SET vote_score = vote_score - OLD.value WHERE id = OLD.entity_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vote_score
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION update_vote_score();

-- Maintain posts.save_count
CREATE OR REPLACE FUNCTION update_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.entity_type = 'post' THEN
    UPDATE public.posts SET save_count = save_count + 1 WHERE id = NEW.entity_id;
  ELSIF TG_OP = 'DELETE' AND OLD.entity_type = 'post' THEN
    UPDATE public.posts SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.entity_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_save_count
  AFTER INSERT OR DELETE ON public.saved_items
  FOR EACH ROW EXECUTE FUNCTION update_save_count();

-- Maintain communities.member_count
CREATE OR REPLACE FUNCTION update_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_member_count
  AFTER INSERT OR DELETE ON public.community_memberships
  FOR EACH ROW EXECUTE FUNCTION update_member_count();

-- Upsert reputation aggregate after event insert
CREATE OR REPLACE FUNCTION upsert_community_reputation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.community_reputation (user_id, community_id, score, updated_at)
  VALUES (NEW.user_id, NEW.community_id, NEW.delta, NOW())
  ON CONFLICT (user_id, community_id)
  DO UPDATE SET score = community_reputation.score + NEW.delta, updated_at = NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reputation_aggregate
  AFTER INSERT ON public.reputation_events
  FOR EACH ROW EXECUTE FUNCTION upsert_community_reputation();

-- Auto-create profile row when user signs up (via Supabase auth hook)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, auth_provider)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'provider', 'email'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
