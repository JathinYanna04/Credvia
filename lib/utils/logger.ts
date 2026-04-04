type LogMeta = Record<string, unknown>;

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      level: 'info',
      scope,
      message,
      timestamp: new Date().toISOString(),
      ...(meta ?? {}),
    }),
  );
}

export function logError(scope: string, message: string, meta?: LogMeta) {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      message,
      timestamp: new Date().toISOString(),
      ...(meta ?? {}),
    }),
  );
}
