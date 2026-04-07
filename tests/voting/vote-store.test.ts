import { beforeEach, describe, expect, it } from 'vitest';
import { applyOptimisticVote, toVoteEntityKey, toCanonicalVoteSnapshot } from '@/lib/voting';
import { useVoteStore } from '@/lib/stores/vote-store';

function resetVoteStore() {
  useVoteStore.setState((state) => ({
    ...state,
    entries: {},
  }));
}

function createSnapshot(overrides?: Partial<ReturnType<typeof toCanonicalVoteSnapshot>>) {
  return {
    ...toCanonicalVoteSnapshot({
      entityType: 'post',
      entityId: 'post-1',
      score: 10,
      upvoteCount: 15,
      downvoteCount: 5,
      currentUserVote: 0,
      updatedAt: '2026-04-07T12:00:00.000Z',
      version: 'server:2026-04-07T12:00:00.000Z',
    }),
    ...overrides,
  };
}

describe('vote store', () => {
  beforeEach(() => {
    resetVoteStore();
  });

  it('begins and settles latest mutation deterministically', () => {
    const store = useVoteStore.getState();
    const key = toVoteEntityKey('post', 'post-1');
    const initial = createSnapshot();

    store.hydrateVoteSnapshot(initial);

    const optimistic = applyOptimisticVote(initial, 1, 1);
    store.beginVoteMutation(key, 'req-1', optimistic);

    const afterBegin = useVoteStore.getState().entries[key];
    expect(afterBegin?.pending?.requestId).toBe('req-1');
    expect(afterBegin?.canonical.currentUserVote).toBe(1);

    const authoritative = createSnapshot({
      score: 11,
      upvoteCount: 16,
      currentUserVote: 1,
      updatedAt: '2026-04-07T12:00:01.000Z',
      version: 'server:2026-04-07T12:00:01.000Z',
    });

    expect(store.settleVoteMutation(key, 'req-1', authoritative)).toBe(true);

    const settled = useVoteStore.getState().entries[key];
    expect(settled?.pending).toBeUndefined();
    expect(settled?.canonical).toMatchObject({
      score: 11,
      currentUserVote: 1,
      version: 'server:2026-04-07T12:00:01.000Z',
    });
  });

  it('ignores stale settle/fail responses', () => {
    const store = useVoteStore.getState();
    const key = toVoteEntityKey('post', 'post-1');
    const initial = createSnapshot();
    const optimistic = applyOptimisticVote(initial, 1, 2);

    store.hydrateVoteSnapshot(initial);
    store.beginVoteMutation(key, 'req-latest', optimistic);

    const staleAuthoritative = createSnapshot({
      score: 9,
      currentUserVote: -1,
      updatedAt: '2026-04-07T11:59:00.000Z',
      version: 'server:2026-04-07T11:59:00.000Z',
    });

    expect(store.settleVoteMutation(key, 'req-stale', staleAuthoritative)).toBe(false);
    expect(store.failVoteMutation(key, 'req-stale')).toBe(false);

    const afterStale = useVoteStore.getState().entries[key];
    expect(afterStale?.pending?.requestId).toBe('req-latest');
    expect(afterStale?.canonical.currentUserVote).toBe(1);
  });

  it('rolls back only the latest failed mutation', () => {
    const store = useVoteStore.getState();
    const key = toVoteEntityKey('post', 'post-1');
    const initial = createSnapshot();
    const optimistic = applyOptimisticVote(initial, -1, 3);

    store.hydrateVoteSnapshot(initial);
    store.beginVoteMutation(key, 'req-rollback', optimistic);

    expect(store.failVoteMutation(key, 'req-rollback')).toBe(true);

    const rolledBack = useVoteStore.getState().entries[key];
    expect(rolledBack?.pending).toBeUndefined();
    expect(rolledBack?.canonical).toMatchObject({
      score: initial.score,
      currentUserVote: initial.currentUserVote,
      version: initial.version,
    });
  });

  it('queues and flushes intent during in-flight mutation', () => {
    const store = useVoteStore.getState();
    const key = toVoteEntityKey('post', 'post-1');
    const initial = createSnapshot();
    const optimistic = applyOptimisticVote(initial, 1, 4);

    store.hydrateVoteSnapshot(initial);
    store.beginVoteMutation(key, 'req-queue', optimistic);

    store.queueVoteIntent(key, -1);

    expect(useVoteStore.getState().entries[key]?.queuedDirection).toBe(-1);
    expect(store.flushQueuedIntent(key)).toBe(-1);
    expect(store.flushQueuedIntent(key)).toBeUndefined();
  });

  it('does not let hydration overwrite pending optimistic state', () => {
    const store = useVoteStore.getState();
    const key = toVoteEntityKey('post', 'post-1');
    const initial = createSnapshot();
    const optimistic = applyOptimisticVote(initial, 1, 5);

    store.hydrateVoteSnapshot(initial);
    store.beginVoteMutation(key, 'req-hydrate', optimistic);

    const staleIncoming = createSnapshot({
      score: 7,
      currentUserVote: -1,
      updatedAt: '2026-04-07T11:58:00.000Z',
      version: 'server:2026-04-07T11:58:00.000Z',
    });
    store.hydrateVoteSnapshot(staleIncoming);

    const current = useVoteStore.getState().entries[key];
    expect(current?.pending?.requestId).toBe('req-hydrate');
    expect(current?.canonical.currentUserVote).toBe(1);
  });
});
