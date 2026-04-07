-- Migration 022: Atomic vote mutation RPCs for canonical score/version consistency

CREATE OR REPLACE FUNCTION public.mutate_post_vote_atomic(
  p_entity_id UUID,
  p_direction SMALLINT DEFAULT NULL,
  p_value SMALLINT DEFAULT NULL
)
RETURNS TABLE (
  entity_id UUID,
  previous_vote SMALLINT,
  current_user_vote SMALLINT,
  score INT,
  upvote_count INT,
  downvote_count INT,
  updated_at TIMESTAMPTZ,
  contribution_delta INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_previous_vote SMALLINT := 0;
  v_requested_direction SMALLINT;
  v_desired_vote SMALLINT := 0;
  v_score INT := 0;
  v_upvote_count INT := 0;
  v_downvote_count INT := 0;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_direction IS NOT NULL AND p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'INVALID_DIRECTION';
  END IF;

  IF p_value IS NOT NULL AND p_value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'INVALID_VOTE_VALUE';
  END IF;

  PERFORM 1
  FROM public.posts
  WHERE id = p_entity_id
    AND status = 'published'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT v.value
  INTO v_previous_vote
  FROM public.votes AS v
  WHERE v.user_id = v_user_id
    AND v.entity_type = 'post'
    AND v.entity_id = p_entity_id;

  v_previous_vote := COALESCE(v_previous_vote, 0);

  v_requested_direction := COALESCE(
    CASE WHEN p_direction IN (-1, 1) THEN p_direction ELSE NULL END,
    CASE WHEN p_value IN (-1, 1) THEN p_value ELSE NULL END
  );

  IF v_requested_direction IS NULL THEN
    v_desired_vote := COALESCE(p_value, 0);
  ELSIF v_previous_vote = v_requested_direction THEN
    v_desired_vote := 0;
  ELSE
    v_desired_vote := v_requested_direction;
  END IF;

  IF v_desired_vote NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'INVALID_DESIRED_VOTE';
  END IF;

  IF v_desired_vote = 0 THEN
    DELETE FROM public.votes AS v
    WHERE v.user_id = v_user_id
      AND v.entity_type = 'post'
      AND v.entity_id = p_entity_id;
  ELSE
    INSERT INTO public.votes (user_id, entity_type, entity_id, value)
    VALUES (v_user_id, 'post', p_entity_id, v_desired_vote)
    ON CONFLICT ON CONSTRAINT votes_user_id_entity_type_entity_id_key
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  SELECT
    COALESCE(SUM(value), 0)::INT,
    COUNT(*) FILTER (WHERE value = 1)::INT,
    COUNT(*) FILTER (WHERE value = -1)::INT
  INTO v_score, v_upvote_count, v_downvote_count
  FROM public.votes AS v
  WHERE v.entity_type = 'post'
    AND v.entity_id = p_entity_id;

  UPDATE public.posts
  SET vote_score = v_score,
      updated_at = NOW()
  WHERE id = p_entity_id
  RETURNING posts.updated_at INTO v_updated_at;

  RETURN QUERY
  SELECT
    p_entity_id,
    v_previous_vote,
    v_desired_vote,
    v_score,
    v_upvote_count,
    v_downvote_count,
    v_updated_at,
    (v_desired_vote - v_previous_vote)::INT;
END;
$$;

CREATE OR REPLACE FUNCTION public.mutate_comment_vote_atomic(
  p_entity_id UUID,
  p_direction SMALLINT DEFAULT NULL,
  p_value SMALLINT DEFAULT NULL
)
RETURNS TABLE (
  entity_id UUID,
  previous_vote SMALLINT,
  current_user_vote SMALLINT,
  score INT,
  upvote_count INT,
  downvote_count INT,
  updated_at TIMESTAMPTZ,
  contribution_delta INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_previous_vote SMALLINT := 0;
  v_requested_direction SMALLINT;
  v_desired_vote SMALLINT := 0;
  v_score INT := 0;
  v_upvote_count INT := 0;
  v_downvote_count INT := 0;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_direction IS NOT NULL AND p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'INVALID_DIRECTION';
  END IF;

  IF p_value IS NOT NULL AND p_value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'INVALID_VOTE_VALUE';
  END IF;

  PERFORM 1
  FROM public.comments
  WHERE id = p_entity_id
    AND status = 'published'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT v.value
  INTO v_previous_vote
  FROM public.votes AS v
  WHERE v.user_id = v_user_id
    AND v.entity_type = 'comment'
    AND v.entity_id = p_entity_id;

  v_previous_vote := COALESCE(v_previous_vote, 0);

  v_requested_direction := COALESCE(
    CASE WHEN p_direction IN (-1, 1) THEN p_direction ELSE NULL END,
    CASE WHEN p_value IN (-1, 1) THEN p_value ELSE NULL END
  );

  IF v_requested_direction IS NULL THEN
    v_desired_vote := COALESCE(p_value, 0);
  ELSIF v_previous_vote = v_requested_direction THEN
    v_desired_vote := 0;
  ELSE
    v_desired_vote := v_requested_direction;
  END IF;

  IF v_desired_vote NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'INVALID_DESIRED_VOTE';
  END IF;

  IF v_desired_vote = 0 THEN
    DELETE FROM public.votes AS v
    WHERE v.user_id = v_user_id
      AND v.entity_type = 'comment'
      AND v.entity_id = p_entity_id;
  ELSE
    INSERT INTO public.votes (user_id, entity_type, entity_id, value)
    VALUES (v_user_id, 'comment', p_entity_id, v_desired_vote)
    ON CONFLICT ON CONSTRAINT votes_user_id_entity_type_entity_id_key
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  SELECT
    COALESCE(SUM(value), 0)::INT,
    COUNT(*) FILTER (WHERE value = 1)::INT,
    COUNT(*) FILTER (WHERE value = -1)::INT
  INTO v_score, v_upvote_count, v_downvote_count
  FROM public.votes AS v
  WHERE v.entity_type = 'comment'
    AND v.entity_id = p_entity_id;

  UPDATE public.comments
  SET vote_score = v_score,
      updated_at = NOW()
  WHERE id = p_entity_id
  RETURNING comments.updated_at INTO v_updated_at;

  RETURN QUERY
  SELECT
    p_entity_id,
    v_previous_vote,
    v_desired_vote,
    v_score,
    v_upvote_count,
    v_downvote_count,
    v_updated_at,
    (v_desired_vote - v_previous_vote)::INT;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_post_vote_atomic(UUID, SMALLINT, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mutate_comment_vote_atomic(UUID, SMALLINT, SMALLINT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mutate_post_vote_atomic(UUID, SMALLINT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_post_vote_atomic(UUID, SMALLINT, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mutate_comment_vote_atomic(UUID, SMALLINT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_comment_vote_atomic(UUID, SMALLINT, SMALLINT) TO service_role;
