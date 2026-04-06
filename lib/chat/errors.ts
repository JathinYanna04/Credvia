export type ChatErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR';

export class ChatServiceError extends Error {
  code: ChatErrorCode;
  status: number;
  details?: unknown;

  constructor(
    code: ChatErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isChatServiceError(error: unknown): error is ChatServiceError {
  return error instanceof ChatServiceError;
}
