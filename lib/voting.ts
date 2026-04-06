export type VoteValue = -1 | 0 | 1;
export type VoteDirection = -1 | 1;
export type VoteEntityType = 'post' | 'comment' | 'startup_idea';
export type VoteEntityKey = `${VoteEntityType}:${string}`;

export interface VoteMutationPayload {
  entityId: string;
  entityType: VoteEntityType;
  score: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote: VoteValue;
  version?: string | null;
  updatedAt?: string | null;
  contributionDelta?: number;
  rankDeltaHint?: number;
}

export interface VoteSnapshot {
  entityType: VoteEntityType;
  entityId: string;
  score: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote: VoteValue;
  version: string;
  updatedAt: string;
}

export interface VoteSnapshotSeed {
  entityType: VoteEntityType;
  entityId: string;
  score: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote?: VoteValue;
  version?: string | null;
  updatedAt?: string | null;
}

export interface VoteStateSnapshot {
  score: number;
  vote: VoteValue;
  updatedAt?: string | null;
}

interface ParsedVoteVersion {
  source: 'none' | 'optimistic' | 'canonical';
  value: number;
  sequence: number;
}

const SERVER_CLOCK_SKEW_TOLERANCE_MS = 3000;
const SERVER_VERSION_PREFIX = 'server:';
const DEFAULT_SERVER_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export function toVoteEntityKey(entityType: VoteEntityType, entityId: string): VoteEntityKey {
  return `${entityType}:${entityId}`;
}

export function isVoteEntityType(value: unknown): value is VoteEntityType {
  return value === 'post' || value === 'comment' || value === 'startup_idea';
}

export function toVoteEntityTypeFromPostType(
  postType: string | null | undefined,
): VoteEntityType {
  return postType === 'startup_idea' ? 'startup_idea' : 'post';
}

export function buildServerVersion(updatedAt: string) {
  return `${SERVER_VERSION_PREFIX}${updatedAt}`;
}

function parseVersion(value: string | null | undefined) {
  if (!value) {
    return { source: 'none', value: 0, sequence: 0 } as ParsedVoteVersion;
  }

  if (value.startsWith(SERVER_VERSION_PREFIX)) {
    const parsed = Date.parse(value.slice(SERVER_VERSION_PREFIX.length));
    if (!Number.isNaN(parsed)) {
      return {
        source: 'canonical',
        value: parsed,
        sequence: 0,
      } as ParsedVoteVersion;
    }
  }

  const optimisticMatch = /^optimistic:(\d+)(?::(\d+))?$/.exec(value);
  if (optimisticMatch) {
    const requestSequence = Number(optimisticMatch[1]) || 0;
    const parsedTimestamp = Number(optimisticMatch[2]);

    return {
      source: 'optimistic',
      value: Number.isFinite(parsedTimestamp) ? parsedTimestamp : requestSequence,
      sequence: requestSequence,
    } as ParsedVoteVersion;
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return {
      source: 'canonical',
      value: parsed,
      sequence: 0,
    } as ParsedVoteVersion;
  }

  return {
    source: 'none',
    value: 0,
    sequence: 0,
  } as ParsedVoteVersion;
}

export function createOptimisticVersion(requestId: number, clientTimestamp = Date.now()) {
  const safeRequestId = Number.isFinite(requestId) ? Math.max(0, Math.trunc(requestId)) : 0;
  const safeTimestamp =
    Number.isFinite(clientTimestamp) ? Math.max(0, Math.trunc(clientTimestamp)) : Date.now();

  return `optimistic:${safeRequestId}:${safeTimestamp}`;
}

function normalizeVoteVersion(version: string | null | undefined, updatedAt: string | null | undefined) {
  if (typeof version === 'string' && parseVersion(version).source !== 'none') {
    return version;
  }

  if (typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt))) {
    return buildServerVersion(updatedAt);
  }

  return buildServerVersion(DEFAULT_SERVER_TIMESTAMP);
}

function normalizeVoteTimestamp(
  version: string | null | undefined,
  updatedAt: string | null | undefined,
) {
  if (typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt))) {
    return updatedAt;
  }

  if (typeof version === 'string') {
    if (version.startsWith(SERVER_VERSION_PREFIX)) {
      const serverTimestamp = version.slice(SERVER_VERSION_PREFIX.length);
      if (!Number.isNaN(Date.parse(serverTimestamp))) {
        return serverTimestamp;
      }
    }

    if (!Number.isNaN(Date.parse(version))) {
      return version;
    }
  }

  return DEFAULT_SERVER_TIMESTAMP;
}

export function isVoteValue(value: unknown): value is VoteValue {
  return value === -1 || value === 0 || value === 1;
}

export function computeNextVote(currentVote: VoteValue, clickedDirection: VoteDirection): VoteValue {
  return currentVote === clickedDirection ? 0 : clickedDirection;
}

export function resolveNextVote(currentVote: VoteValue, requestedVote: VoteDirection): VoteValue {
  return computeNextVote(currentVote, requestedVote);
}

export function computeVoteDelta(fromVote: VoteValue, toVote: VoteValue) {
  return {
    scoreDelta: toVote - fromVote,
    upvoteDelta: (toVote === 1 ? 1 : 0) - (fromVote === 1 ? 1 : 0),
    downvoteDelta: (toVote === -1 ? 1 : 0) - (fromVote === -1 ? 1 : 0),
  };
}

function isVoteSnapshot(value: VoteStateSnapshot | VoteSnapshot): value is VoteSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entityType' in value &&
    'entityId' in value &&
    'currentUserVote' in value &&
    'version' in value
  );
}

export function applyOptimisticVote(
  current: VoteStateSnapshot,
  requestedVote: VoteDirection,
  requestId: number,
): VoteStateSnapshot;
export function applyOptimisticVote(
  current: VoteSnapshot,
  requestedVote: VoteDirection,
  requestId: number,
): VoteSnapshot;
export function applyOptimisticVote(
  current: VoteStateSnapshot | VoteSnapshot,
  requestedVote: VoteDirection,
  requestId: number,
): VoteStateSnapshot | VoteSnapshot {
  const optimisticVersion = createOptimisticVersion(requestId);

  if (isVoteSnapshot(current)) {
    const nextVote = computeNextVote(current.currentUserVote, requestedVote);
    const delta = computeVoteDelta(current.currentUserVote, nextVote);

    return {
      ...current,
      score: current.score + delta.scoreDelta,
      upvoteCount:
        typeof current.upvoteCount === 'number'
          ? Math.max(0, current.upvoteCount + delta.upvoteDelta)
          : undefined,
      downvoteCount:
        typeof current.downvoteCount === 'number'
          ? Math.max(0, current.downvoteCount + delta.downvoteDelta)
          : undefined,
      currentUserVote: nextVote,
      version: optimisticVersion,
      updatedAt: optimisticVersion,
    };
  }

  const nextVote = computeNextVote(current.vote, requestedVote);

  return {
    score: current.score - current.vote + nextVote,
    vote: nextVote,
    updatedAt: optimisticVersion,
  };
}

export function toCanonicalVoteSnapshot(seed: VoteSnapshotSeed): VoteSnapshot {
  const currentUserVote = isVoteValue(seed.currentUserVote)
    ? seed.currentUserVote
    : 0;
  const updatedAt = normalizeVoteTimestamp(seed.version, seed.updatedAt);

  return {
    entityType: seed.entityType,
    entityId: seed.entityId,
    score: seed.score,
    upvoteCount:
      typeof seed.upvoteCount === 'number' && Number.isFinite(seed.upvoteCount)
        ? Math.max(0, seed.upvoteCount)
        : undefined,
    downvoteCount:
      typeof seed.downvoteCount === 'number' && Number.isFinite(seed.downvoteCount)
        ? Math.max(0, seed.downvoteCount)
        : undefined,
    currentUserVote,
    updatedAt,
    version: normalizeVoteVersion(seed.version, updatedAt),
  };
}

export function resolveVoteMutationPayload(raw: unknown): VoteSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = (
    'data' in raw && raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : (raw as Record<string, unknown>)
  );

  const entityType = candidate.entityType;
  const entityId = candidate.entityId;
  const score = candidate.score;
  const currentUserVote = candidate.currentUserVote;

  if (
    !isVoteEntityType(entityType) ||
    typeof entityId !== 'string' ||
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    !isVoteValue(currentUserVote)
  ) {
    return null;
  }

  return toCanonicalVoteSnapshot({
    entityType,
    entityId,
    score,
    upvoteCount:
      typeof candidate.upvoteCount === 'number'
        ? candidate.upvoteCount
        : typeof candidate.upvote_count === 'number'
          ? candidate.upvote_count
          : undefined,
    downvoteCount:
      typeof candidate.downvoteCount === 'number'
        ? candidate.downvoteCount
        : typeof candidate.downvote_count === 'number'
          ? candidate.downvote_count
          : undefined,
    currentUserVote,
    version: typeof candidate.version === 'string' ? candidate.version : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  });
}

export function resolveVoteMutationState(
  payload: VoteMutationPayload | null | undefined,
): VoteStateSnapshot | null {
  const resolved = resolveVoteMutationPayload(payload);
  if (!resolved) {
    return null;
  }

  return {
    score: resolved.score,
    vote: resolved.currentUserVote,
    updatedAt: resolved.version,
  };
}

export function isIncomingVoteStateFresher(
  local: Pick<VoteSnapshot, 'version' | 'updatedAt'> | null | undefined,
  incoming: Pick<VoteSnapshot, 'version' | 'updatedAt'>,
) {
  return shouldPreferVoteState(local?.version ?? local?.updatedAt, incoming.version ?? incoming.updatedAt);
}

export function mergeVoteSnapshots(
  local: VoteSnapshot | null | undefined,
  incoming: VoteSnapshot,
) {
  if (!local || isIncomingVoteStateFresher(local, incoming)) {
    return incoming;
  }

  return local;
}

export function shouldPreferVoteState(
  currentVersion: string | null | undefined,
  nextVersion: string | null | undefined,
) {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);

  if (current.source === 'optimistic' && next.source === 'canonical') {
    return next.value >= current.value - SERVER_CLOCK_SKEW_TOLERANCE_MS;
  }

  if (current.source === 'canonical' && next.source === 'optimistic') {
    return next.value > current.value;
  }

  if (next.value !== current.value) {
    return next.value > current.value;
  }

  if (next.sequence !== current.sequence) {
    return next.sequence > current.sequence;
  }

  if (current.source !== next.source) {
    return next.source === 'canonical';
  }

  return false;
}
