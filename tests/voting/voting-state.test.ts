import { describe, expect, it } from 'vitest';
import { applyOptimisticVote, resolveNextVote, shouldPreferVoteState } from '@/lib/voting';

describe('voting state helpers', () => {
  it('toggles an upvote off when the same vote is pressed again', () => {
    expect(resolveNextVote(1, 1)).toBe(0);
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
});
