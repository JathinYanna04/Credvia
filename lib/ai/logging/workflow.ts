import { logError, logInfo } from '@/lib/utils/logger';

export interface WorkflowLogContext {
  traceId: string;
  runId: string;
  workflowType: string;
  entityId: string;
}

export function truncateForLog(value: string, maxLength = 600) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...<truncated:${value.length - maxLength}>`;
}

export function logWorkflowEvent(
  level: 'info' | 'error',
  scope: string,
  message: string,
  context: WorkflowLogContext,
  meta?: Record<string, unknown>,
) {
  const payload = {
    traceId: context.traceId,
    runId: context.runId,
    workflowType: context.workflowType,
    entityId: context.entityId,
    ...(meta ?? {}),
  };

  if (level === 'error') {
    logError(scope, message, payload);
    return;
  }

  logInfo(scope, message, payload);
}