'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IdeaFilters } from '@/components/startup-ideas/IdeaFilters';
import { StartupIdeaCard } from '@/components/startup-ideas/StartupIdeaCard';
import { StartupIdeaCardSkeleton } from '@/components/startup-ideas/StartupIdeaCardSkeleton';
import posthog from '@/lib/analytics/posthog-client';
import { useVoteStore } from '@/lib/stores/vote-store';
import type { PostSummary } from '@/lib/types';
import { toCanonicalVoteSnapshot, toVoteEntityTypeFromPostType } from '@/lib/voting';

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<PostSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'traction' | 'active'>('traction');
  const [stage, setStage] = useState('');
  const [category, setCategory] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const hydrateManyVoteSnapshots = useVoteStore(
    (state) => state.hydrateManyVoteSnapshots,
  );
  const hasTrackedSortChange = useRef(false);
  const queryRef = useRef(query);
  const stageRef = useRef(stage);
  const categoryRef = useRef(category);
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    queryRef.current = query;
    stageRef.current = stage;
    categoryRef.current = category;
  }, [category, query, stage]);

  useEffect(() => {
    if (!hasTrackedSortChange.current) {
      hasTrackedSortChange.current = true;
      return;
    }

    posthog.capture('idea_sorted', {
      sort,
      query: queryRef.current.trim() || null,
      stage: stageRef.current || null,
      category: categoryRef.current || null,
    });
  }, [sort]);

  useEffect(() => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    const controller = new AbortController();

    setIdeas(undefined);
    setError(null);
    const params = new URLSearchParams();
    params.set('sort', sort);
    if (query.trim()) {
      params.set('q', query.trim());
    }
    if (stage) {
      params.set('stage', stage);
    }
    if (category) {
      params.set('category', category);
    }

    fetch(`/api/v1/ideas?${params.toString()}`, { signal: controller.signal })
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

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load startup ideas.');
        }

        const nextIdeas = payload.data ?? [];
        hydrateManyVoteSnapshots(
          nextIdeas.map((idea) =>
            toCanonicalVoteSnapshot({
              entityType: toVoteEntityTypeFromPostType(idea.postType),
              entityId: idea.id,
              score: idea.voteScore,
              upvoteCount: idea.upvoteCount,
              downvoteCount: idea.downvoteCount,
              currentUserVote: idea.currentUserVote,
              version: idea.version,
              updatedAt: idea.updatedAt,
            }),
          ),
        );
        setIdeas(nextIdeas);
      })
      .catch((fetchError: unknown) => {
        if (
          controller.signal.aborted ||
          fetchRequestIdRef.current !== requestId ||
          (fetchError instanceof Error && fetchError.name === 'AbortError')
        ) {
          return;
        }

        setIdeas([]);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Could not load startup ideas.',
        );
      });

    return () => {
      controller.abort();
    };
  }, [category, query, refreshKey, sort, stage, hydrateManyVoteSnapshots]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Startup Ideas</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Share an early idea, gather real feedback, and track traction before you sink months into the wrong build.
          </p>
        </div>
        <Button asChild>
          <Link href="/ideas/new">Submit idea</Link>
        </Button>
      </header>

      <IdeaFilters
        query={query}
        sort={sort}
        stage={stage}
        category={category}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onStageChange={setStage}
        onCategoryChange={setCategory}
      />

      <section className="space-y-4">
        {ideas === undefined ? (
          <>
            <StartupIdeaCardSkeleton />
            <StartupIdeaCardSkeleton />
          </>
        ) : null}
        {error ? (
          <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
              Retry
            </Button>
          </div>
        ) : null}
        {ideas?.length === 0 ? (
          <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
            <p>No startup ideas match these filters yet.</p>
            <Button asChild variant="secondary">
              <Link href="/ideas/new">Submit the first matching idea</Link>
            </Button>
          </div>
        ) : null}
        {ideas?.map((idea) => <StartupIdeaCard key={idea.id} idea={idea} />)}
      </section>
    </div>
  );
}
