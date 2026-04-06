import { fail, ok, handleApiError } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  toCommentSummaries,
  toPostSummaries,
} from "@/lib/supabase/query-helpers";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const postResult = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail("NOT_FOUND", "Post not found.", 404);
    }

    const [post] = await toPostSummaries(supabase, [postResult.data], user?.id);
    const commentsResult = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", params.id)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (commentsResult.error) {
      throw new Error(commentsResult.error.message);
    }

    const comments = await toCommentSummaries(
      supabase,
      commentsResult.data ?? [],
      postResult.data.community_id,
    );

    return ok({ post, comments });
  } catch (error) {
    return handleApiError(error);
  }
}
