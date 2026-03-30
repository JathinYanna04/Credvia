'use client';

import { useEffect, useState } from 'react';
import type { FeedTab, PostSummary } from '@/lib/types';

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
          throw new Error(payload.error?.message ?? 'Failed to load feed.');
        }

        setPosts(payload.data ?? []);
      })
      .catch((fetchError) =>
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load feed.'),
      );
  }, [tab, refreshKey]);

  return {
    posts,
    error,
    authExpired,
    isLoading: posts === undefined && !error,
    isEmpty: Array.isArray(posts) && posts.length === 0,
    retry: () => setRefreshKey((current) => current + 1),
  };
}
