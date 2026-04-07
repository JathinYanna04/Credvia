import { resolveVoteMutationPayload, type VoteSnapshot } from '@/lib/voting';
import { useVoteStore } from '@/lib/stores/vote-store';

const CHANNEL_NAME = 'credvia-vote-sync-v1';
const STORAGE_EVENT_KEY = 'credvia-vote-sync-event';

interface VoteSyncMessage {
  snapshot: VoteSnapshot;
  emittedAt: number;
}

let initialized = false;

function hydrateFromSyncMessage(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return;
  }

  const message = raw as Partial<VoteSyncMessage>;
  const snapshot = resolveVoteMutationPayload(message.snapshot);
  if (!snapshot) {
    return;
  }

  useVoteStore.getState().applyExternalCanonicalUpdate(snapshot);
}

export function publishVoteSettlement(snapshot: VoteSnapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  const message: VoteSyncMessage = {
    snapshot,
    emittedAt: Date.now(),
  };

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }

  try {
    window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(message));
    window.localStorage.removeItem(STORAGE_EVENT_KEY);
  } catch {
    // Ignore storage write errors in restricted browsing contexts.
  }
}

export function initializeVoteSync() {
  if (typeof window === 'undefined' || initialized) {
    return () => undefined;
  }

  let channel: BroadcastChannel | null = null;

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }

    try {
      const parsed = JSON.parse(event.newValue) as VoteSyncMessage;
      hydrateFromSyncMessage(parsed);
    } catch {
      // Ignore malformed cross-tab events.
    }
  };

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      hydrateFromSyncMessage(event.data);
    };
  }

  window.addEventListener('storage', onStorage);
  initialized = true;

  return () => {
    window.removeEventListener('storage', onStorage);
    if (channel) {
      channel.close();
    }
    initialized = false;
  };
}
