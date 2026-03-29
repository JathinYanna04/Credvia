import { inngest } from '@/lib/inngest/client';

const REPUTATION_DELTAS = {
  post_upvote: 2,
  post_downvote: -1,
  comment_upvote: 3,
  comment_downvote: -1,
  best_answer: 10,
  post_saved: 1,
  post_removed: -10,
  comment_removed: -8,
} as const;

export const reputationEvent = inngest.createFunction(
  { id: 'process-reputation-event', concurrency: 50 },
  { event: 'credvia/reputation.event' },
  async ({ event }) => {
    const delta = REPUTATION_DELTAS[event.data.sourceType as keyof typeof REPUTATION_DELTAS];

    return {
      processed: Boolean(delta),
      delta: delta ?? 0,
    };
  },
);
