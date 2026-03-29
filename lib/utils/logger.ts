type LogMeta = Record<string, unknown>;

function formatMeta(meta?: LogMeta) {
  if (!meta) {
    return '';
  }

  try {
    return JSON.stringify(meta);
  } catch {
    return '[unserializable-meta]';
  }
}

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  // eslint-disable-next-line no-console
  console.info(`[${scope}] ${message}${meta ? ` ${formatMeta(meta)}` : ''}`);
}

export function logError(scope: string, message: string, meta?: LogMeta) {
  // eslint-disable-next-line no-console
  console.error(`[${scope}] ${message}${meta ? ` ${formatMeta(meta)}` : ''}`);
}
