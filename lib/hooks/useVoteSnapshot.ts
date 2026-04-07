"use client";

import { useEffect, useMemo } from 'react';
import {
  toCanonicalVoteSnapshot,
  type VoteEntityType,
  type VoteSnapshot,
  type VoteSnapshotSeed,
} from '@/lib/voting';
import { useVoteStore, useVoteStoreEntry } from '@/lib/stores/vote-store';

type VoteSnapshotInput = Omit<VoteSnapshotSeed, 'entityType' | 'entityId'>;

export function useVoteSnapshot(
  entityType: VoteEntityType,
  entityId: string,
  input: VoteSnapshotInput,
): VoteSnapshot {
  const hydrateVoteSnapshot = useVoteStore((state) => state.hydrateVoteSnapshot);
  const entry = useVoteStoreEntry(entityType, entityId);

  const initialSnapshot = useMemo(
    () =>
      toCanonicalVoteSnapshot({
        entityType,
        entityId,
        score: input.score,
        upvoteCount: input.upvoteCount,
        downvoteCount: input.downvoteCount,
        currentUserVote: input.currentUserVote,
        version: input.version,
        updatedAt: input.updatedAt,
      }),
    [
      entityType,
      entityId,
      input.score,
      input.upvoteCount,
      input.downvoteCount,
      input.currentUserVote,
      input.version,
      input.updatedAt,
    ],
  );

  useEffect(() => {
    hydrateVoteSnapshot(initialSnapshot);
  }, [hydrateVoteSnapshot, initialSnapshot]);

  return entry?.canonical ?? initialSnapshot;
}
