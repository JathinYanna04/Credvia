export type VoteValue = -1 | 0 | 1;

export interface VoteMutationPayload {
  entityId: string;
  entityType: string;
  score: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote: VoteValue;
  updatedAt?: string | null;
  contributionDelta?: number;
  rankDeltaHint?: number;
}

export interface VoteStateSnapshot {
  score: number;
  vote: VoteValue;
  updatedAt?: string | null;
}

function parseVersion(value: string | null | undefined) {
  if (!value) {
    return { rank: 0, value: 0 };
  }

  if (value.startsWith('optimistic:')) {
    return {
      rank: 2,
      value: Number(value.slice('optimistic:'.length)) || 0,
    };
  }

  const parsed = Date.parse(value);
  return {
    rank: 1,
    value: Number.isNaN(parsed) ? 0 : parsed,
  };
}

export function resolveNextVote(currentVote: VoteValue, requestedVote: -1 | 1): VoteValue {
  return currentVote === requestedVote ? 0 : requestedVote;
}

export function applyOptimisticVote(
  current: VoteStateSnapshot,
  requestedVote: -1 | 1,
  requestId: number,
): VoteStateSnapshot {
  const nextVote = resolveNextVote(current.vote, requestedVote);

  return {
    score: current.score - current.vote + nextVote,
    vote: nextVote,
    updatedAt: `optimistic:${requestId}`,
  };
}

export function shouldPreferVoteState(
  currentVersion: string | null | undefined,
  nextVersion: string | null | undefined,
) {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);

  if (next.rank !== current.rank) {
    return next.rank > current.rank;
  }

  return next.value >= current.value;
}
