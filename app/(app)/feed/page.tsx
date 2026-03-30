'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedEmpty } from '@/components/feed/FeedEmpty';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { InfiniteScroll } from '@/components/feed/InfiniteScroll';
import { PostCardSkeleton } from '@/components/feed/PostCardSkeleton';
import { PostCard } from '@/components/feed/PostCard';
import { useFeed } from '@/lib/hooks/useFeed';
import type { FeedTab } from '@/lib/types';

export default function FeedPage() {
  const [tab, setTab] = useState<FeedTab>('for-you');
  const { posts, isLoading, isEmpty, error, authExpired, retry } = useFeed(tab);

  return (
    <div className="mx-auto max-w-feed">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Feed</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ranked contribution from the communities and people that sharpen your work.
        </p>
      </header>

      <FeedTabs value={tab} onValueChange={setTab} />

      <div className="mt-6 space-y-4">
        {authExpired ? (
          <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>Your session expired. Sign in again to keep reading your feed.</span>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        ) : null}
        {error ? (
          <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : null}
        {isEmpty ? <FeedEmpty /> : null}
        {posts?.map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      <InfiniteScroll />
    </div>
  );
}
