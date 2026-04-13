import type { AiRunStatus } from '@/lib/ai/contracts';
import { AiRuntimeError } from '@/lib/ai/errors';

const ALLOWED_TRANSITIONS: Record<AiRunStatus, AiRunStatus[]> = {
  queued: ['running', 'failed'],
  running: ['succeeded', 'failed', 'queued'],
  succeeded: [],
  failed: ['queued'],
};

export function isAllowedTransition(from: AiRunStatus, to: AiRunStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertAllowedTransition(from: AiRunStatus, to: AiRunStatus) {
  if (!isAllowedTransition(from, to)) {
    throw new AiRuntimeError(
      'AI_RUN_STATE_INVALID',
      `Invalid AI run transition from ${from} to ${to}.`,
      409,
      { from, to },
      'Reload run state and retry the operation.',
    );
  }
}

export function statusTimestampPatch(status: AiRunStatus) {
  const now = new Date().toISOString();

  if (status === 'running') {
    return {
      started_at: now,
      failed_at: null,
      completed_at: null,
    };
  }

  if (status === 'succeeded') {
    return {
      completed_at: now,
      failed_at: null,
    };
  }

  if (status === 'failed') {
    return {
      failed_at: now,
      completed_at: now,
    };
  }

  return {
    completed_at: null,
    failed_at: null,
  };
}
