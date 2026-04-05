import { fail, handleApiError, ok, parseJson } from "@/lib/api";
import { VoteCommentSchema } from "@/lib/schemas/comment";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser } from "@/lib/supabase/helpers";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, VoteCommentSchema);
    const limit = await enforceRateLimit(
      "vote",
      `${user.id}:comment:${params.id}`,
    );

    if (!limit.success) {
      return fail("RATE_LIMITED", "Too many votes. Try again shortly.", 429);
    }

    const commentResult = await supabase
      .from("comments")
      .select("id")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (commentResult.error) {
      throw new Error(commentResult.error.message);
    }

    if (!commentResult.data) {
      return fail("NOT_FOUND", "Comment not found.", 404);
    }

    const existingVoteResult = await supabase
      .from("votes")
      .select("id, value")
      .eq("user_id", user.id)
      .eq("entity_type", "comment")
      .eq("entity_id", params.id)
      .maybeSingle();

    if (existingVoteResult.error) {
      throw new Error(existingVoteResult.error.message);
    }

    if (body.value === 0) {
      if (existingVoteResult.data) {
        const deleteResult = await supabase
          .from("votes")
          .delete()
          .eq("id", existingVoteResult.data.id);

        if (deleteResult.error) {
          throw new Error(deleteResult.error.message);
        }
      }
    } else if (existingVoteResult.data) {
      const updateResult = await supabase
        .from("votes")
        .update({ value: body.value })
        .eq("id", existingVoteResult.data.id);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }
    } else {
      const insertResult = await supabase.from("votes").insert({
        user_id: user.id,
        entity_type: "comment",
        entity_id: params.id,
        value: body.value,
      });

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    const refreshedComment = await supabase
      .from("comments")
      .select("vote_score")
      .eq("id", params.id)
      .single();

    if (refreshedComment.error) {
      throw new Error(refreshedComment.error.message);
    }

    return ok({
      acknowledged: true,
      value: body.value,
      score: refreshedComment.data.vote_score,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    return handleApiError(error);
  }
}
