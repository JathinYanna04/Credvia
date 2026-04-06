"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedTab, PostSummary } from "@/lib/types";
import {
  shouldPreferVoteState,
  toCanonicalVoteSnapshot,
  toVoteEntityTypeFromPostType,
} from '@/lib/voting';
import { useVoteStore } from '@/lib/stores/vote-store';

function dedupePostsById(posts: PostSummary[]) {
  const seen = new Set<string>();

  return posts.filter((post) => {
    if (seen.has(post.id)) {
      return false;
    }

    seen.add(post.id);
    return true;
  });
}

export function mergePosts(
  current: PostSummary[] | undefined,
  incoming: PostSummary[],
) {
  const dedupedIncoming = dedupePostsById(incoming);

  if (!current) {
    return dedupedIncoming;
  }

  const currentById = new Map(current.map((post) => [post.id, post]));

  return dedupedIncoming.map((post) => {
    const existing = currentById.get(post.id);

    if (
      !existing ||
      shouldPreferVoteState(
        existing.version ?? existing.updatedAt,
        post.version ?? post.updatedAt,
      )
    ) {
      return post;
    }

    return {
      ...post,
      voteScore: existing.voteScore,
      upvoteCount: existing.upvoteCount,
      downvoteCount: existing.downvoteCount,
      currentUserVote: existing.currentUserVote,
      version: existing.version,
      updatedAt: existing.updatedAt,
      startupIdea: existing.startupIdea ?? post.startupIdea,
    };
  });
}

export const mergeFeedPosts = mergePosts;

export function useFeed(tab: FeedTab) {
  const [posts, setPosts] = useState<PostSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchRequestIdRef = useRef(0);
  const previousTabRef = useRef(tab);
  const hydrateManyVoteSnapshots = useVoteStore(
    (state) => state.hydrateManyVoteSnapshots,
  );

  useEffect(() => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;

    const controller = new AbortController();
    const tabChanged = previousTabRef.current !== tab;
    previousTabRef.current = tab;

    if (tabChanged) {
      setPosts(undefined);
    }

    setError(null);
    setAuthExpired(false);

    fetch(`/api/v1/feed?tab=${tab}`, { signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted || fetchRequestIdRef.current !== requestId) {
          return;
        }

        const payload = (await response.json()) as {
          data?: PostSummary[];
          error?: { message?: string };
        };

        if (controller.signal.aborted || fetchRequestIdRef.current !== requestId) {
          return;
        }

        if (response.status === 401) {
          setAuthExpired(true);
          setPosts([]);
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Failed to load feed.");
        }

        const nextPosts = payload.data ?? [];
        hydrateManyVoteSnapshots(
          nextPosts.map((post) =>
            toCanonicalVoteSnapshot({
              entityType: toVoteEntityTypeFromPostType(post.postType),
              entityId: post.id,
              score: post.voteScore,
              upvoteCount: post.upvoteCount,
              downvoteCount: post.downvoteCount,
              currentUserVote: post.currentUserVote,
              version: post.version,
              updatedAt: post.updatedAt,
            }),
          ),
        );

        setPosts((current) => mergePosts(current, nextPosts));
      })
      .catch((fetchError) => {
        if (
          controller.signal.aborted ||
          fetchRequestIdRef.current !== requestId ||
          (fetchError instanceof Error && fetchError.name === "AbortError")
        ) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load feed.",
        );
      });

    return () => {
      controller.abort();
    };
  }, [tab, refreshKey, hydrateManyVoteSnapshots]);

  return {
    posts,
    error,
    authExpired,
    isLoading: posts === undefined && !error,
    isEmpty: Array.isArray(posts) && posts.length === 0,
    retry: () => setRefreshKey((current) => current + 1),
  };
}
