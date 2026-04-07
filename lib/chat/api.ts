import { fail, handleApiError } from '@/lib/api';
import { isChatServiceError } from '@/lib/chat/errors';

export function toClampedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.floor(parsed);
  return Math.min(max, Math.max(min, rounded));
}

export function handleChatApiError(error: unknown) {
  if (isChatServiceError(error)) {
    return fail(error.code, error.message, error.status, error.details);
  }

  return handleApiError(error);
}
