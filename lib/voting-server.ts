import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  buildServerVersion,
  toUserVote,
  type VoteEntityType,
  type VoteValue,
} from '@/lib/voting';
import type { Database } from '@/lib/supabase/types';

type TypedSupabaseClient = SupabaseClient<Database>;

export type VoteTarget = 'post' | 'comment';

interface VoteEntityStateRow {
  vote_score: number | null;
  updated_at: string | null;
}

interface VoteRow {
  value: VoteValue;
}

export interface VoteRouteResponse {
  entityId: string;
  entityType: VoteEntityType;
  userVote: 'up' | 'down' | null;
  currentUserVote: VoteValue;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
  version: string;
  updatedAt: string;
  contributionDelta: number;
  rankDeltaHint: number;
}

export interface VoteErrorMeta {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
}

const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';

export function getVoteDbErrorMeta(error: PostgrestError): VoteErrorMeta {
  return {
    code: error.code ?? null,
    message: error.message,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

export function mapVoteMutationError(error: PostgrestError) {
  const message = error.message ?? '';

  if (message.includes('NOT_FOUND')) {
    return {
      code: 'NOT_FOUND' as const,
      message: 'Entity not found.',
      status: 404,
    };
  }

  if (message.includes('UNAUTHORIZED')) {
    return {
      code: 'UNAUTHORIZED' as const,
      message: 'You need to sign in.',
      status: 401,
    };
  }

  if (message.includes('INVALID_')) {
    return {
      code: 'VALIDATION_ERROR' as const,
      message: 'Invalid vote request.',
      status: 400,
    };
  }

  return null;
}

export function buildVoteRouteResponse(input: {
  entityId: string;
  entityType: VoteEntityType;
  currentUserVote: VoteValue;
  upvoteCount: number | null | undefined;
  downvoteCount: number | null | undefined;
  score: number | null | undefined;
  updatedAt: string | null | undefined;
  contributionDelta: number;
}): VoteRouteResponse {
  const upvoteCount = Math.max(0, Number(input.upvoteCount ?? 0));
  const downvoteCount = Math.max(0, Number(input.downvoteCount ?? 0));
  const score = Number.isFinite(input.score) ? Number(input.score) : upvoteCount - downvoteCount;
  const updatedAt =
    typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt))
      ? input.updatedAt
      : DEFAULT_UPDATED_AT;

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    userVote: toUserVote(input.currentUserVote),
    currentUserVote: input.currentUserVote,
    upvoteCount,
    downvoteCount,
    score,
    version: buildServerVersion(updatedAt),
    updatedAt,
    contributionDelta: input.contributionDelta,
    rankDeltaHint: input.contributionDelta,
  };
}

export async function recoverAuthoritativeVoteState(
  supabase: TypedSupabaseClient,
  target: VoteTarget,
  entityId: string,
  userId: string,
): Promise<VoteRouteResponse | null> {
  const entityTable = target === 'post' ? 'posts' : 'comments';
  const entityType: VoteEntityType = target === 'post' ? 'post' : 'comment';

  const entityResult = await supabase
    .from(entityTable)
    .select('vote_score, updated_at')
    .eq('id', entityId)
    .maybeSingle();

  if (entityResult.error) {
    throw new Error(entityResult.error.message);
  }

  if (!entityResult.data) {
    return null;
  }

  const [ownVoteResult, upvoteCountResult, downvoteCountResult] = await Promise.all([
    supabase
      .from('votes')
      .select('value')
      .eq('user_id', userId)
      .eq('entity_type', target)
      .eq('entity_id', entityId)
      .maybeSingle(),
    supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', target)
      .eq('entity_id', entityId)
      .eq('value', 1),
    supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', target)
      .eq('entity_id', entityId)
      .eq('value', -1),
  ]);

  if (ownVoteResult.error) {
    throw new Error(ownVoteResult.error.message);
  }

  if (upvoteCountResult.error) {
    throw new Error(upvoteCountResult.error.message);
  }

  if (downvoteCountResult.error) {
    throw new Error(downvoteCountResult.error.message);
  }

  const entityState = entityResult.data as VoteEntityStateRow;
  const voteRow = ownVoteResult.data as VoteRow | null;

  return buildVoteRouteResponse({
    entityId,
    entityType,
    currentUserVote: (voteRow?.value ?? 0) as VoteValue,
    upvoteCount: upvoteCountResult.count ?? 0,
    downvoteCount: downvoteCountResult.count ?? 0,
    score: entityState.vote_score ?? 0,
    updatedAt: entityState.updated_at ?? null,
    contributionDelta: 0,
  });
}
