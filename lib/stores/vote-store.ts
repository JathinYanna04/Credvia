import { create } from 'zustand';
import {
  mergeVoteSnapshots,
  toVoteEntityKey,
  type VoteDirection,
  type VoteEntityKey,
  type VoteEntityType,
  type VoteSnapshot,
  type VoteValue,
} from '@/lib/voting';

export interface VotePendingState {
  requestId: string;
  intendedVote: VoteValue;
  startedAt: number;
  previousSnapshot: VoteSnapshot;
  optimisticSnapshot: VoteSnapshot;
}

export interface VoteStoreEntry {
  canonical: VoteSnapshot;
  pending?: VotePendingState;
  queuedDirection?: VoteDirection;
}

export interface VoteStoreState {
  entries: Record<VoteEntityKey, VoteStoreEntry>;
  hydrateSnapshot: (snapshot: VoteSnapshot) => void;
  hydrateManySnapshots: (snapshots: VoteSnapshot[]) => void;
  beginMutation: (
    entityKey: VoteEntityKey,
    requestId: string,
    optimisticSnapshot: VoteSnapshot,
  ) => void;
  settleMutation: (
    entityKey: VoteEntityKey,
    requestId: string,
    authoritativeSnapshot: VoteSnapshot,
  ) => boolean;
  failMutation: (entityKey: VoteEntityKey, requestId: string) => boolean;
  queueIntent: (entityKey: VoteEntityKey, direction: VoteDirection) => void;
  applyExternalCanonicalUpdate: (snapshot: VoteSnapshot) => void;
  hydrateVoteSnapshot: (snapshot: VoteSnapshot) => void;
  hydrateManyVoteSnapshots: (snapshots: VoteSnapshot[]) => void;
  beginVoteMutation: (
    entityKey: VoteEntityKey,
    requestId: string,
    optimisticSnapshot: VoteSnapshot,
  ) => void;
  settleVoteMutation: (
    entityKey: VoteEntityKey,
    requestId: string,
    authoritativeSnapshot: VoteSnapshot,
  ) => boolean;
  failVoteMutation: (entityKey: VoteEntityKey, requestId: string) => boolean;
  queueVoteIntent: (entityKey: VoteEntityKey, direction: VoteDirection) => void;
  flushQueuedIntent: (entityKey: VoteEntityKey) => VoteDirection | undefined;
}

function replaceEntry(
  state: VoteStoreState,
  entityKey: VoteEntityKey,
  nextEntry: VoteStoreEntry,
): VoteStoreState {
  return {
    ...state,
    entries: {
      ...state.entries,
      [entityKey]: nextEntry,
    },
  };
}

export const useVoteStore = create<VoteStoreState>((set, get) => ({
  entries: {},

  hydrateSnapshot: (snapshot) => {
    get().hydrateVoteSnapshot(snapshot);
  },

  hydrateManySnapshots: (snapshots) => {
    get().hydrateManyVoteSnapshots(snapshots);
  },

  beginMutation: (entityKey, requestId, optimisticSnapshot) => {
    get().beginVoteMutation(entityKey, requestId, optimisticSnapshot);
  },

  settleMutation: (entityKey, requestId, authoritativeSnapshot) => {
    return get().settleVoteMutation(entityKey, requestId, authoritativeSnapshot);
  },

  failMutation: (entityKey, requestId) => {
    return get().failVoteMutation(entityKey, requestId);
  },

  queueIntent: (entityKey, direction) => {
    get().queueVoteIntent(entityKey, direction);
  },

  applyExternalCanonicalUpdate: (snapshot) => {
    get().hydrateVoteSnapshot(snapshot);
  },

  hydrateVoteSnapshot: (snapshot) => {
    const entityKey = toVoteEntityKey(snapshot.entityType, snapshot.entityId);

    set((state) => {
      const existing = state.entries[entityKey];
      if (!existing) {
        return replaceEntry(state, entityKey, { canonical: snapshot });
      }

      // Keep optimistic/pending local mutations authoritative until they settle.
      if (existing.pending) {
        return state;
      }

      const merged = mergeVoteSnapshots(existing.canonical, snapshot);
      if (merged === existing.canonical) {
        return state;
      }

      return replaceEntry(state, entityKey, {
        ...existing,
        canonical: merged,
      });
    });
  },

  hydrateManyVoteSnapshots: (snapshots) => {
    if (snapshots.length === 0) {
      return;
    }

    set((state) => {
      let nextState = state;

      for (const snapshot of snapshots) {
        const entityKey = toVoteEntityKey(snapshot.entityType, snapshot.entityId);
        const existing = nextState.entries[entityKey];

        if (!existing) {
          nextState = replaceEntry(nextState, entityKey, {
            canonical: snapshot,
          });
          continue;
        }

        if (existing.pending) {
          continue;
        }

        const merged = mergeVoteSnapshots(existing.canonical, snapshot);
        if (merged === existing.canonical) {
          continue;
        }

        nextState = replaceEntry(nextState, entityKey, {
          ...existing,
          canonical: merged,
        });
      }

      return nextState;
    });
  },

  beginVoteMutation: (entityKey, requestId, optimisticSnapshot) => {
    set((state) => {
      const existing = state.entries[entityKey];
      const previousSnapshot = existing?.canonical ?? optimisticSnapshot;

      return replaceEntry(state, entityKey, {
        ...existing,
        canonical: optimisticSnapshot,
        pending: {
          requestId,
          intendedVote: optimisticSnapshot.currentUserVote,
          startedAt: Date.now(),
          previousSnapshot,
          optimisticSnapshot,
        },
      });
    });
  },

  settleVoteMutation: (entityKey, requestId, authoritativeSnapshot) => {
    const state = get();
    const existing = state.entries[entityKey];
    if (!existing?.pending) {
      return false;
    }

    if (existing.pending.requestId !== requestId) {
      return false;
    }

    set((currentState) => {
      const currentEntry = currentState.entries[entityKey];
      if (!currentEntry?.pending || currentEntry.pending.requestId !== requestId) {
        return currentState;
      }

      return replaceEntry(currentState, entityKey, {
        ...currentEntry,
        canonical: authoritativeSnapshot,
        pending: undefined,
      });
    });

    return true;
  },

  failVoteMutation: (entityKey, requestId) => {
    const state = get();
    const existing = state.entries[entityKey];
    if (!existing?.pending) {
      return false;
    }

    if (existing.pending.requestId !== requestId) {
      return false;
    }

    set((currentState) => {
      const currentEntry = currentState.entries[entityKey];
      if (!currentEntry?.pending || currentEntry.pending.requestId !== requestId) {
        return currentState;
      }

      return replaceEntry(currentState, entityKey, {
        ...currentEntry,
        canonical: currentEntry.pending.previousSnapshot,
        pending: undefined,
      });
    });

    return true;
  },

  queueVoteIntent: (entityKey, direction) => {
    set((state) => {
      const existing = state.entries[entityKey];
      if (!existing) {
        return state;
      }

      return replaceEntry(state, entityKey, {
        ...existing,
        queuedDirection: direction,
      });
    });
  },

  flushQueuedIntent: (entityKey) => {
    const existing = get().entries[entityKey];
    const queuedDirection = existing?.queuedDirection;

    if (!existing || queuedDirection === undefined) {
      return undefined;
    }

    set((state) =>
      replaceEntry(state, entityKey, {
        ...existing,
        queuedDirection: undefined,
      }),
    );

    return queuedDirection;
  },
}));

export function useVoteStoreEntry(entityType: VoteEntityType, entityId: string) {
  const key = toVoteEntityKey(entityType, entityId);
  return useVoteStore((state) => state.entries[key]);
}

export function getVoteStoreEntry(entityType: VoteEntityType, entityId: string) {
  const key = toVoteEntityKey(entityType, entityId);
  return useVoteStore.getState().entries[key];
}
