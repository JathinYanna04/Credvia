"use client";

import { useEffect, useState } from "react";
import { computeIdeaValidationScore } from "@/lib/utils/idea-score";
import type { FeedTab, PostSummary } from "@/lib/types";
import { shouldPreferVoteState } from '@/lib/voting';

export function mergeFeedPosts(
  current: PostSummary[] | undefined,
  incoming: PostSummary[],
) {
  if (!current) {
    return incoming;
  }

  const currentById = new Map(current.map((post) => [post.id, post]));

  return incoming.map((post) => {
    const existing = currentById.get(post.id);

    if (!existing || shouldPreferVoteState(existing.updatedAt, post.updatedAt)) {
      return post;
    }

    return {
      ...post,
      voteScore: existing.voteScore,
      viewerVote: existing.viewerVote,
      updatedAt: existing.updatedAt,
      startupIdea: existing.startupIdea ?? post.startupIdea,
    };
  });
}

export function useFeed(tab: FeedTab) {
  const [posts, setPosts] = useState<PostSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPosts(undefined);
    setError(null);
    setAuthExpired(false);

    fetch(`/api/v1/feed?tab=${tab}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: PostSummary[];
          error?: { message?: string };
        };

        if (response.status === 401) {
          setAuthExpired(true);
          setPosts([]);
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Failed to load feed.");
        }

        setPosts((current) => mergeFeedPosts(current, payload.data ?? []));
      })
      .catch((fetchError) =>
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load feed.",
        ),
      );
  }, [tab, refreshKey]);

  return {
    posts,
    error,
    authExpired,
    isLoading: posts === undefined && !error,
    isEmpty: Array.isArray(posts) && posts.length === 0,
    updateVote: (
      postId: string,
      next: { score: number; vote: -1 | 0 | 1; updatedAt?: string },
    ) =>
      setPosts(
        (current) =>
          current?.map((post) => {
            if (post.id !== postId) {
              return post;
            }

            return {
              ...post,
              voteScore: next.score,
              viewerVote: next.vote,
              updatedAt: next.updatedAt ?? post.updatedAt,
              startupIdea: post.startupIdea
                ? {
                    ...post.startupIdea,
                    validationScore: computeIdeaValidationScore({
                      voteScore: next.score,
                      commentCount: post.commentCount,
                      saveCount: post.saveCount,
                      uniqueCommenters: post.startupIdea.uniqueCommenters,
                      createdAt: post.createdAt,
                    }),
                  }
                : undefined,
            };
          }) ?? current,
      ),
    retry: () => setRefreshKey((current) => current + 1),
  };
}
