"use client";

import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  applyOptimisticVote,
  type VoteMutationPayload,
  type VoteValue,
  shouldPreferVoteState,
} from '@/lib/voting';
import { cn } from "@/lib/utils/cn";

export interface VoteButtonsProps {
  score: number;
  initialVote?: -1 | 0 | 1;
  updatedAt?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
  endpoint?: string;
  onVoteChange?: (next: { score: number; vote: VoteValue; updatedAt?: string }) => void;
}

export function VoteButtons({
  score,
  initialVote = 0,
  updatedAt,
  orientation = "horizontal",
  className,
  endpoint,
  onVoteChange,
}: VoteButtonsProps) {
  const [localScore, setLocalScore] = useState(score);
  const [vote, setVote] = useState<VoteValue>(initialVote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | undefined>(updatedAt);
  const [pulse, setPulse] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!shouldPreferVoteState(localUpdatedAt, updatedAt)) {
      return;
    }

    setLocalScore(score);
    setVote(initialVote);
    setLocalUpdatedAt(updatedAt);
    setError(null);
  }, [score, initialVote, loading, localUpdatedAt, updatedAt]);

  const applyVote = async (nextVote: -1 | 1) => {
    if (loading) {
      return;
    }

    const previousState = {
      score: localScore,
      vote,
      updatedAt: localUpdatedAt,
    };
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const optimisticState = applyOptimisticVote(previousState, nextVote, requestId);

    setVote(optimisticState.vote);
    setLocalScore(optimisticState.score);
    setLocalUpdatedAt(optimisticState.updatedAt ?? undefined);
    setPulse(true);
    setError(null);
    onVoteChange?.({
      score: optimisticState.score,
      vote: optimisticState.vote,
      updatedAt: optimisticState.updatedAt ?? undefined,
    });

    if (!endpoint) {
      return;
    }

    setLoading(true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: optimisticState.vote }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (requestIdRef.current === requestId) {
        setVote(previousState.vote);
        setLocalScore(previousState.score);
        setLocalUpdatedAt(previousState.updatedAt ?? undefined);
      }
      setError(payload?.error?.message ?? "Could not save your vote.");
      onVoteChange?.({
        score: previousState.score,
        vote: previousState.vote,
        updatedAt: previousState.updatedAt ?? undefined,
      });
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as { data?: VoteMutationPayload };

    if (requestIdRef.current === requestId) {
      const nextVoteValue =
        typeof payload.data?.currentUserVote === "number"
          ? payload.data.currentUserVote
          : optimisticState.vote;
      const nextScore =
        typeof payload.data?.score === "number"
          ? payload.data.score
          : optimisticState.score;
      const nextUpdatedAt = payload.data?.updatedAt ?? optimisticState.updatedAt;

      setVote(nextVoteValue);
      setLocalScore(nextScore);
      setLocalUpdatedAt(nextUpdatedAt ?? undefined);
      onVoteChange?.({
        score: nextScore,
        vote: nextVoteValue,
        updatedAt: nextUpdatedAt ?? undefined,
      });
    }

    setLoading(false);
    window.setTimeout(() => setPulse(false), 180);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border border-border-subtle bg-bg-base p-1",
          orientation === "vertical" && "flex-col rounded-2xl p-2",
          className,
        )}
      >
        <button
          type="button"
          disabled={loading}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-accent active:scale-[0.97]",
            vote === 1 && "bg-[rgba(34,211,238,0.12)] text-accent",
          )}
          onClick={() => void applyVote(1)}
          aria-label="Upvote post"
        >
          <ArrowBigUp className="h-5 w-5" />
        </button>
        <span
          aria-live="polite"
          className={cn(
            "min-w-[2rem] text-center font-mono text-xs transition-transform duration-200",
            pulse && "scale-110",
            localScore > 0 ? "text-accent" : "text-text-tertiary",
          )}
        >
          {localScore}
        </span>
        <button
          type="button"
          disabled={loading}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-danger active:scale-[0.97]",
            vote === -1 && "bg-[rgba(248,113,113,0.12)] text-danger",
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
