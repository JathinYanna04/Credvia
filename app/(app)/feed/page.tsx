'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const { posts, isLoading, isEmpty, error, authExpired, retry } = useFeed(tab);

  useEffect(() => {
    fetch('/api/v1/users/me')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          data?: { profile?: { onboarding_complete?: boolean } };
        };

        setShowOnboardingPrompt(!(payload.data?.profile?.onboarding_complete ?? true));
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-feed space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Home</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Read strong questions, help someone move forward, and build reputation where your work is strongest.
            </p>
          </div>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/post/new">Ask or share</Link>
          </Button>
        </div>
      </header>

      {showOnboardingPrompt ? (
        <div className="surface-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-text-primary">Make your feed sharper</div>
            <p className="mt-1 text-sm text-text-secondary">
              You can keep browsing now, then add skills and communities when you are ready.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/communities">Join communities</Link>
            </Button>
            <Button asChild>
              <Link href="/onboarding/interests">Add skills</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="surface-panel p-2 sm:p-3">
        <div className="mb-1 px-3 pt-2 text-xs uppercase tracking-[0.16em] text-text-tertiary">
          Your contribution loop
        </div>
        <div className="px-3 pb-1">
          <FeedTabs value={tab} onValueChange={setTab} />
        </div>
      </section>

      <div className="space-y-4">
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

      <div className="pb-20 sm:hidden">
        <Button asChild className="w-full">
          <Link href="/post/new">Ask or share</Link>
        </Button>
      </div>

      <InfiniteScroll />
    </div>
  );
}
