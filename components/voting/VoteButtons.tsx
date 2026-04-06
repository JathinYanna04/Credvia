"use client";

import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyOptimisticVote,
  computeNextVote,
  resolveVoteMutationPayload,
  toCanonicalVoteSnapshot,
  toVoteEntityKey,
  type VoteDirection,
  type VoteEntityType,
  type VoteSnapshot,
  type VoteSnapshotSeed,
} from '@/lib/voting';
import { useVoteStore, useVoteStoreEntry } from '@/lib/stores/vote-store';
import { publishVoteSettlement } from '@/lib/voting-sync';
import { logInfo } from '@/lib/utils/logger';
import { cn } from "@/lib/utils/cn";

export interface VoteButtonsProps {
  entityType: VoteEntityType;
  entityId: string;
  initialVoteState: Omit<VoteSnapshotSeed, 'entityType' | 'entityId'>;
  orientation?: "vertical" | "horizontal";
  className?: string;
  endpoint?: string;
}

export function VoteButtons({
  entityType,
  entityId,
  initialVoteState,
  orientation = "horizontal",
  className,
  endpoint,
}: VoteButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const requestSequenceRef = useRef(0);
  const shouldDebugLog = process.env.NODE_ENV !== 'production';

  const initialSnapshot = useMemo(
    () =>
      toCanonicalVoteSnapshot({
        entityType,
        entityId,
        score: initialVoteState.score,
        upvoteCount: initialVoteState.upvoteCount,
        downvoteCount: initialVoteState.downvoteCount,
        currentUserVote: initialVoteState.currentUserVote,
        version: initialVoteState.version,
        updatedAt: initialVoteState.updatedAt,
      }),
    [
      entityType,
      entityId,
      initialVoteState.score,
      initialVoteState.upvoteCount,
      initialVoteState.downvoteCount,
      initialVoteState.currentUserVote,
      initialVoteState.version,
      initialVoteState.updatedAt,
    ],
  );

  const entityKey = useMemo(
    () => toVoteEntityKey(entityType, entityId),
    [entityType, entityId],
  );
  const entry = useVoteStoreEntry(entityType, entityId);
  const hydrateSnapshot = useVoteStore((state) => state.hydrateSnapshot);

  useEffect(() => {
    hydrateSnapshot(initialSnapshot);
  }, [hydrateSnapshot, initialSnapshot]);

  const activeSnapshot = entry?.canonical ?? initialSnapshot;
  const isMutating = Boolean(entry?.pending);
  const entityLabel =
    entityType === 'comment'
      ? 'comment'
      : entityType === 'startup_idea'
        ? 'startup idea'
        : 'post';

  const settleQueuedIntent = () => {
    const queuedDirection = useVoteStore.getState().flushQueuedIntent(entityKey);
    if (queuedDirection === undefined) {
      return;
    }

    const latestSnapshot =
      useVoteStore.getState().entries[entityKey]?.canonical ?? activeSnapshot;
    if (computeNextVote(latestSnapshot.currentUserVote, queuedDirection) === latestSnapshot.currentUserVote) {
      return;
    }

    void submitVote(queuedDirection);
  };

  const submitVote = async (clickedDirection: VoteDirection) => {
    const store = useVoteStore.getState();
    const currentEntry = store.entries[entityKey];
    const currentSnapshot = currentEntry?.canonical ?? activeSnapshot;

    const debugVoteEvent = (message: string, meta?: Record<string, unknown>) => {
      if (!shouldDebugLog) {
        return;
      }

      logInfo('client-vote', message, {
        entityKey,
        entityType,
        entityId,
        ...(meta ?? {}),
      });
    };

    if (currentEntry?.pending) {
      store.queueIntent(entityKey, clickedDirection);
      debugVoteEvent('Queued vote intent while mutation is in-flight', {
        pendingRequestId: currentEntry.pending.requestId,
        queuedDirection: clickedDirection,
      });
      return;
    }

    requestSequenceRef.current += 1;
    const requestSequence = requestSequenceRef.current;
    const requestId = `${entityKey}:${requestSequence}:${Date.now()}`;
    const optimisticSnapshot = applyOptimisticVote(
      currentSnapshot,
      clickedDirection,
      requestSequence,
    ) as VoteSnapshot;

    store.beginMutation(entityKey, requestId, optimisticSnapshot);
    debugVoteEvent('Vote mutation started', {
      requestId,
      previousVote: currentSnapshot.currentUserVote,
      intendedVote: optimisticSnapshot.currentUserVote,
    });
    setPulse(true);
    setError(null);

    if (!endpoint) {
      store.settleMutation(entityKey, requestId, optimisticSnapshot);
      debugVoteEvent('Vote settled locally without endpoint', {
        requestId,
      });
      window.setTimeout(() => setPulse(false), 180);
      settleQueuedIntent();
      return;
    }

    let failureMessage = "Could not save your vote.";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: clickedDirection,
          value: optimisticSnapshot.currentUserVote,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          payload.error &&
          typeof payload.error === 'object' &&
          'message' in payload.error &&
          typeof payload.error.message === 'string'
            ? payload.error.message
            : null;

        failureMessage = errorMessage ?? failureMessage;
        if (store.failMutation(entityKey, requestId)) {
          setError(failureMessage);
          debugVoteEvent('Vote mutation failed with non-OK response', {
            requestId,
            status: response.status,
            errorMessage: failureMessage,
          });
          window.setTimeout(() => setPulse(false), 180);
          settleQueuedIntent();
        } else {
          debugVoteEvent('Ignored stale non-OK vote response', {
            requestId,
            status: response.status,
          });
        }
        return;
      }

      const authoritativePayload = resolveVoteMutationPayload(payload);
      if (!authoritativePayload) {
        if (store.failMutation(entityKey, requestId)) {
          setError("Vote response was incomplete. Please retry.");
          debugVoteEvent('Vote mutation failed due to invalid payload', {
            requestId,
          });
          window.setTimeout(() => setPulse(false), 180);
          settleQueuedIntent();
        } else {
          debugVoteEvent('Ignored stale invalid vote payload', {
            requestId,
          });
        }
        return;
      }

      const authoritativeSnapshot: VoteSnapshot = {
        ...authoritativePayload,
        entityType,
        entityId,
      };

      if (store.settleMutation(entityKey, requestId, authoritativeSnapshot)) {
        publishVoteSettlement(authoritativeSnapshot);
        debugVoteEvent('Vote mutation settled with canonical payload', {
          requestId,
          canonicalVote: authoritativeSnapshot.currentUserVote,
          canonicalScore: authoritativeSnapshot.score,
          canonicalVersion: authoritativeSnapshot.version,
        });
      } else {
        debugVoteEvent('Ignored stale canonical vote settlement', {
          requestId,
          canonicalVersion: authoritativeSnapshot.version,
        });
      }
      window.setTimeout(() => setPulse(false), 180);
      settleQueuedIntent();
    } catch {
      if (store.failMutation(entityKey, requestId)) {
        setError(failureMessage);
        debugVoteEvent('Vote mutation failed with network/exception', {
          requestId,
          errorMessage: failureMessage,
        });
        window.setTimeout(() => setPulse(false), 180);
        settleQueuedIntent();
      } else {
        debugVoteEvent('Ignored stale network failure for vote mutation', {
          requestId,
        });
      }
    }
  };

  const handleVotePress = (nextVote: VoteDirection) => {
    void submitVote(nextVote);
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
          disabled={false}
          aria-pressed={activeSnapshot.currentUserVote === 1}
          aria-busy={isMutating}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-accent active:scale-[0.97]",
            activeSnapshot.currentUserVote === 1 && "bg-[rgba(34,211,238,0.12)] text-accent",
            isMutating && "opacity-90",
          )}
          onClick={() => handleVotePress(1)}
          aria-label={`Upvote ${entityLabel}`}
        >
          <ArrowBigUp className="h-5 w-5" />
        </button>
        <span
          aria-live="polite"
          className={cn(
            "min-w-[2rem] text-center font-mono text-xs transition-transform duration-200",
            pulse && "scale-110",
            activeSnapshot.score > 0 ? "text-accent" : "text-text-tertiary",
          )}
        >
          {activeSnapshot.score}
        </span>
        <button
          type="button"
          disabled={false}
          aria-pressed={activeSnapshot.currentUserVote === -1}
          aria-busy={isMutating}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg-overlay hover:text-danger active:scale-[0.97]",
            activeSnapshot.currentUserVote === -1 && "bg-[rgba(248,113,113,0.12)] text-danger",
            isMutating && "opacity-90",
          )}
          onClick={() => handleVotePress(-1)}
          aria-label={`Downvote ${entityLabel}`}
        >
          <ArrowBigDown className="h-5 w-5" />
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
