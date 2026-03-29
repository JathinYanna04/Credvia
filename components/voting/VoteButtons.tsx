'use client';

import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

export interface VoteButtonsProps {
  score: number;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  endpoint?: string;
}

export function VoteButtons({
  score,
  orientation = 'horizontal',
  className,
  endpoint,
}: VoteButtonsProps) {
  const [localScore, setLocalScore] = useState(score);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyVote = async (nextVote: -1 | 1) => {
    if (loading) {
      return;
    }

    const resolvedVote = vote === nextVote ? 0 : nextVote;
    const optimisticScore = localScore - vote + resolvedVote;

    setVote(resolvedVote);
    setLocalScore(optimisticScore);
    setError(null);

    if (!endpoint) {
      return;
    }

    setLoading(true);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: resolvedVote }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setVote(vote);
      setLocalScore(localScore);
      setError(payload?.error?.message ?? 'Could not save your vote.');
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as { data?: { score?: number } };
    if (typeof payload.data?.score === 'number') {
      setLocalScore(payload.data.score);
    }

    setLoading(false);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border border-border-subtle bg-bg-base p-1',
          orientation === 'vertical' && 'flex-col rounded-2xl p-2',
          className,
        )}
      >
        <button
          type="button"
          disabled={loading}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-accent',
            vote === 1 && 'bg-[rgba(34,211,238,0.12)] text-accent',
          )}
          onClick={() => void applyVote(1)}
          aria-label="Upvote post"
        >
          <ArrowBigUp className="h-5 w-5" />
        </button>
        <span
          aria-live="polite"
          className={cn(
            'min-w-[2rem] text-center font-mono text-xs',
            localScore > 0 ? 'text-accent' : 'text-text-tertiary',
          )}
        >
          {localScore}
        </span>
        <button
          type="button"
          disabled={loading}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-danger',
            vote === -1 && 'bg-[rgba(248,113,113,0.12)] text-danger',
          )}
          onClick={() => void applyVote(-1)}
          aria-label="Downvote post"
        >
          <ArrowBigDown className="h-5 w-5" />
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
