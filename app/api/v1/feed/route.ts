import { ok, handleApiError, fail } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser } from "@/lib/supabase/helpers";
import { toPostSummaries } from "@/lib/supabase/query-helpers";
import { getRankedFeed } from "@/lib/utils/feed-rank";
import type { FeedTab } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const { searchParams } = new URL(request.url);
    const cursor = Number(searchParams.get("cursor") ?? "0");
    const tab = (searchParams.get("tab") ?? "for-you") as FeedTab;
    const limit = 20;

    const membershipsResult = await supabase
      .from("community_memberships")
      .select("community_id")
      .eq("user_id", user.id);

    if (membershipsResult.error) {
      throw new Error(membershipsResult.error.message);
    }

    const followsResult = await supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", user.id);

    if (followsResult.error) {
      throw new Error(followsResult.error.message);
    }

    const membershipIds = (membershipsResult.data ?? []).map(
      (item) => item.community_id,
    );
    const followedIds = (followsResult.data ?? []).map(
      (item) => item.followed_id,
    );

    let query = supabase
      .from("posts")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(60);

    if (tab === "communities" && membershipIds.length > 0) {
      query = query.in("community_id", membershipIds);
    }

    if (tab === "following" && followedIds.length > 0) {
      query = query.in("author_id", followedIds);
    }

    const postsResult = await query;

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    const candidatePosts = postsResult.data ?? [];
    const filteredPosts =
      tab === "for-you"
        ? candidatePosts.filter(
            (post) =>
              membershipIds.includes(post.community_id) ||
              followedIds.includes(post.author_id) ||
              membershipIds.length < 3,
          )
        : candidatePosts;

    const summaries = await toPostSummaries(supabase, filteredPosts, user.id);
    const ranked = tab === "for-you" ? getRankedFeed(summaries) : summaries;
    const slice = ranked.slice(cursor, cursor + limit);

    return ok(slice, {
      cursor: cursor + limit < ranked.length ? String(cursor + limit) : null,
      total: ranked.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    return handleApiError(error);
  }
}
