import { fail } from "@/lib/api";
import type {
  CommentSummary,
  PostSummary,
  StartupIdeaRevisionSummary,
} from "@/lib/types";
import { isMissingStartupIdeaAdvancedSchemaError } from "@/lib/supabase/startup-idea-schema";
import {
  getStartupIdeaRevisionsByPostIds,
  toCommentSummaries,
  toPostSummaries,
  type TypedSupabaseClient,
} from "@/lib/supabase/query-helpers";

export interface StartupIdeaBundle {
  idea: PostSummary;
  comments: CommentSummary[];
  revisions: StartupIdeaRevisionSummary[];
  isFollowing: boolean;
  canRevise: boolean;
  advancedFeaturesEnabled: boolean;
}

export async function getStartupIdeaBundle(
  supabase: TypedSupabaseClient,
  postId: string,
  viewerId?: string | null,
) {
  const postResult = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("post_type", "startup_idea")
    .eq("status", "published")
    .maybeSingle();

  if (postResult.error) {
    throw new Error(postResult.error.message);
  }

  if (!postResult.data) {
    return fail("NOT_FOUND", "Startup idea not found.", 404);
  }

  const [idea] = await toPostSummaries(supabase, [postResult.data], viewerId);

  if (!idea) {
    return fail("NOT_FOUND", "Startup idea not found.", 404);
  }

  const [commentsResult, revisionsMap, followResult] = await Promise.all([
    supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .eq("status", "published")
      .order("created_at", { ascending: true }),
    getStartupIdeaRevisionsByPostIds(supabase, [postId]),
    viewerId
      ? supabase
          .from("idea_followers")
          .select("post_id")
          .eq("post_id", postId)
          .eq("user_id", viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (commentsResult.error) {
    throw new Error(commentsResult.error.message);
  }

  const advancedFeaturesEnabled = !followResult.error;

  if (
    followResult.error &&
    !isMissingStartupIdeaAdvancedSchemaError(followResult.error)
  ) {
    throw new Error(followResult.error.message);
  }

  const comments = await toCommentSummaries(
    supabase,
    commentsResult.data ?? [],
    postResult.data.community_id,
    viewerId,
  );

  return {
    idea,
    comments,
    revisions: revisionsMap.get(postId) ?? [],
    isFollowing: Boolean(followResult.data),
    canRevise:
      advancedFeaturesEnabled && viewerId === postResult.data.author_id,
    advancedFeaturesEnabled,
  } satisfies StartupIdeaBundle;
}
