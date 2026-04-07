import { describe, expect, it } from 'vitest';
import {
  applyOptimisticVote,
  computeNextVote,
  computeVoteDelta,
  createOptimisticVersion,
  resolveVoteMutationPayload,
  resolveNextVote,
  resolveVoteMutationState,
  shouldPreferVoteState,
  toCanonicalVoteSnapshot,
} from '@/lib/voting';

describe('voting state helpers', () => {
  it('toggles an upvote off when the same vote is pressed again', () => {
    expect(resolveNextVote(1, 1)).toBe(0);
    expect(computeNextVote(1, 1)).toBe(0);
  });

  it('computes deterministic vote deltas for direction switches', () => {
    expect(computeVoteDelta(1, -1)).toEqual({
      scoreDelta: -2,
      upvoteDelta: -1,
      downvoteDelta: 1,
    });
  });

  it('switches score correctly when moving from upvote to downvote', () => {
    expect(
      applyOptimisticVote(
        { score: 8, vote: 1, updatedAt: '2026-04-06T09:00:00.000Z' },
        -1,
        1,
      ),
    ).toMatchObject({
      score: 6,
      vote: -1,
    });
  });

  it('prefers the newer canonical version over an older fetch result', () => {
    expect(
      shouldPreferVoteState(
        '2026-04-06T10:00:00.000Z',
        '2026-04-06T09:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('allows canonical mutation response to replace optimistic state when not stale', () => {
    const optimisticVersion = createOptimisticVersion(
      7,
      Date.parse('2026-04-06T10:00:00.000Z'),
    );

    expect(
      shouldPreferVoteState(
        optimisticVersion,
        '2026-04-06T10:00:01.000Z',
      ),
    ).toBe(true);
  });

  it('keeps optimistic state when canonical fetch is clearly older', () => {
    const optimisticVersion = createOptimisticVersion(
      7,
      Date.parse('2026-04-06T10:00:00.000Z'),
    );

    expect(
      shouldPreferVoteState(
        optimisticVersion,
        '2026-04-06T09:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('parses authoritative mutation payload into a deterministic vote state', () => {
    expect(
      resolveVoteMutationState({
        entityId: 'post-1',
        entityType: 'post',
        score: 11,
        currentUserVote: 1,
        updatedAt: '2026-04-06T10:00:00.000Z',
      }),
    ).toEqual({
      score: 11,
      vote: 1,
      updatedAt: 'server:2026-04-06T10:00:00.000Z',
    });
  });

  it('normalizes canonical snapshots with deterministic server version', () => {
    expect(
      toCanonicalVoteSnapshot({
        entityType: 'post',
        entityId: 'post-1',
        score: 5,
        currentUserVote: 1,
        updatedAt: '2026-04-06T10:00:00.000Z',
      }),
    ).toMatchObject({
      version: 'server:2026-04-06T10:00:00.000Z',
      updatedAt: '2026-04-06T10:00:00.000Z',
      currentUserVote: 1,
    });
  });

  it('parses wrapped mutation payloads with data envelope', () => {
    expect(
      resolveVoteMutationPayload({
        data: {
          entityId: 'post-1',
          entityType: 'post',
          score: 12,
          currentUserVote: 1,
          updatedAt: '2026-04-06T10:00:02.000Z',
          version: 'server:2026-04-06T10:00:02.000Z',
        },
      }),
    ).toMatchObject({
      entityId: 'post-1',
      entityType: 'post',
      score: 12,
      currentUserVote: 1,
      version: 'server:2026-04-06T10:00:02.000Z',
    });
  });

  it('treats malformed mutation payload as failure input', () => {
    expect(
      resolveVoteMutationState({
        entityId: 'post-1',
        entityType: 'post',
        score: Number.NaN,
        currentUserVote: 1,
      }),
    ).toBeNull();
  });
});
