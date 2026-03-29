'use client';

import { useEffect, useState } from 'react';
import type { FeedTab, PostSummary } from '@/lib/types';

export function useFeed(tab: FeedTab) {
  const [posts, setPosts] = useState<PostSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPosts(undefined);
    setError(null);

    fetch(`/api/v1/feed?tab=${tab}`)
      .then((response) => response.json())
      .then((payload) => setPosts(payload.data as PostSummary[]))
      .catch(() => setError('Failed to load feed.'));
  }, [tab]);

  return {
    posts,
    error,
    isLoading: posts === undefined && !error,
    isEmpty: Array.isArray(posts) && posts.length === 0,
  };
}
