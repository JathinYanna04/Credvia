import { ok, handleApiError, fail } from "@/lib/api";
import { normalizePersonaSlug } from '@/lib/personas';
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser } from "@/lib/supabase/helpers";
import { isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import { toPostSummaries } from "@/lib/supabase/query-helpers";
import { getRankedFeed } from "@/lib/utils/feed-rank";
import { buildFeedExplanation } from "@/lib/utils/feed-rank";
import { logError, logInfo } from '@/lib/utils/logger';
import type { FeedTab, PostSummary } from "@/lib/types";

export async function GET(request: Request) {
  const verboseLogging = process.env.NODE_ENV !== 'production';
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    authUserId = user.id;
    const { searchParams } = new URL(request.url);
    const cursor = Number(searchParams.get("cursor") ?? "0");
    const tab = (searchParams.get("tab") ?? "for-you") as FeedTab;
    const limit = 20;

    if (verboseLogging) {
      logInfo('api-feed', 'Feed request received', {
        userId: user.id,
        tab,
        cursor,
      });
    }

    const [membershipsResult, followsResult, profileResult] = await Promise.all([
      supabase
        .from("community_memberships")
        .select("community_id")
        .eq("user_id", user.id),
      supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", user.id),
      supabase
        .from('profiles')
        .select('primary_persona, profile_intent, interest_tags')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (membershipsResult.error && !isRecoverableSupabaseReadError(membershipsResult.error)) {
      throw new Error(membershipsResult.error.message);
    }

    if (membershipsResult.error && verboseLogging) {
      logInfo('api-feed', 'Recoverable community membership read failure', {
        userId: user.id,
        error: membershipsResult.error.message,
      });
    }

    if (followsResult.error && !isRecoverableSupabaseReadError(followsResult.error)) {
      throw new Error(followsResult.error.message);
    }

    if (followsResult.error && verboseLogging) {
      logInfo('api-feed', 'Recoverable follows read failure', {
        userId: user.id,
        error: followsResult.error.message,
      });
    }

    if (profileResult.error && !isRecoverableSupabaseReadError(profileResult.error)) {
      throw new Error(profileResult.error.message);
    }

    if (verboseLogging) {
      logInfo('api-feed', 'Feed profile context resolved', {
        userId: user.id,
        hasProfile: Boolean(profileResult.data),
        profileError: profileResult.error?.message ?? null,
      });
    }

    const membershipIds = (membershipsResult.error ? [] : membershipsResult.data ?? []).map(
      (item) => item.community_id,
    );
    const followedIds = (followsResult.error ? [] : followsResult.data ?? []).map(
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

    if (tab === 'founders') {
      query = query.or('post_type.eq.startup_idea');
    }

    if (tab === 'careers') {
      query = query.in('post_type', ['resume_review', 'opportunity', 'discussion']);
    }

    const postsResult = await query;

    if (postsResult.error && !isRecoverableSupabaseReadError(postsResult.error)) {
      throw new Error(postsResult.error.message);
    }

    if (postsResult.error) {
      if (verboseLogging) {
        logInfo('api-feed', 'Recoverable posts query failure, returning empty feed', {
          userId: user.id,
          tab,
          error: postsResult.error.message,
        });
      }

      return ok([], {
        cursor: null,
        total: 0,
      });
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
        : tab === 'mentors'
          ? candidatePosts.filter(
              (post) =>
                post.post_type === 'question' ||
                post.post_type === 'discussion' ||
                post.post_type === 'resume_review',
            )
          : tab === 'recruiters'
            ? candidatePosts.filter(
                (post) =>
                  post.post_type === 'opportunity' ||
                  post.post_type === 'resume_review' ||
                  post.post_type === 'discussion',
              )
        : candidatePosts;

    let summaries: PostSummary[] = [];
    try {
      summaries = await toPostSummaries(supabase, filteredPosts, user.id);
    } catch (summaryError) {
      const summaryErrorForClassification =
        summaryError instanceof Error
          ? summaryError
          : typeof summaryError === 'object' && summaryError !== null
            ? (summaryError as { message?: string; code?: string })
            : undefined;

      if (!isRecoverableSupabaseReadError(summaryErrorForClassification)) {
        throw summaryError;
      }

      if (verboseLogging) {
        logInfo('api-feed', 'Recoverable feed enrichment failure, returning empty summaries', {
          userId: user.id,
          error:
            summaryError instanceof Error
              ? summaryError.message
              : 'Unknown enrichment failure',
        });
      }
    }

    if (verboseLogging) {
      logInfo('api-feed', 'Feed payload computed', {
        userId: user.id,
        tab,
        postCount: candidatePosts.length,
        filteredPostCount: filteredPosts.length,
        summaryCount: summaries.length,
        viewerVoteCount: summaries.filter((post) => (post.viewerVote ?? 0) !== 0).length,
      });
    }

    const ranked = getRankedFeed(summaries, new Map(), {
      tab,
      persona: normalizePersonaSlug(
        profileResult.error ? null : profileResult.data?.primary_persona,
      ),
    });
    const slice = ranked.slice(cursor, cursor + limit).map((post) => ({
      ...post,
      feedExplanation: buildFeedExplanation(post, {
        tab,
        persona: normalizePersonaSlug(
          profileResult.error ? null : profileResult.data?.primary_persona,
        ),
      }),
    }));

    return ok(slice, {
      cursor: cursor + limit < ranked.length ? String(cursor + limit) : null,
      total: ranked.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    logError('api-feed', 'Feed route failed', {
      userId: authUserId,
      error: error instanceof Error ? error.message : 'Unknown feed route error',
    });

    return handleApiError(error);
  }
}
