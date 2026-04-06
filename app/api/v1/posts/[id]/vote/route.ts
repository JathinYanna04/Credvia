import { fail, handleApiError, ok, parseJson } from "@/lib/api";
import { VotePostSchema } from "@/lib/schemas/post";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/supabase/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser } from "@/lib/supabase/helpers";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, VotePostSchema);
    const limit = await enforceRateLimit(
      "vote",
      `${user.id}:post:${params.id}`,
    );

    if (!limit.success) {
      return fail("RATE_LIMITED", "Too many votes. Try again shortly.", 429);
    }

    const postResult = await supabase
      .from("posts")
      .select("id, author_id, title")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail("NOT_FOUND", "Post not found.", 404);
    }

    const existingVoteResult = await supabase
      .from("votes")
      .select("id, value")
      .eq("user_id", user.id)
      .eq("entity_type", "post")
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
        entity_type: "post",
        entity_id: params.id,
        value: body.value,
      });

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    const refreshedPost = await supabase
      .from("posts")
      .select("vote_score")
      .eq("id", params.id)
      .single();

    if (refreshedPost.error) {
      throw new Error(refreshedPost.error.message);
    }

    if (body.value !== 0 && postResult.data.author_id !== user.id) {
      await sendNotification({
        userId: postResult.data.author_id,
        notifType: "vote",
        actorUserId: user.id,
        entityType: "post",
        entityId: params.id,
        payload: {
          title: postResult.data.title,
          value: body.value,
        },
      });
    }

    return ok({
      acknowledged: true,
      value: body.value,
      score: refreshedPost.data.vote_score,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    return handleApiError(error);
  }
}
