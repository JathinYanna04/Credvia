type LogMeta = Record<string, unknown>;

interface StructuredLogEntry {
  level: 'info' | 'error';
  scope: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

type LifecycleStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface LifecycleEvent {
  runId: string;
  traceId: string | null;
  status: LifecycleStatus;
  timestamp: string;
  attemptCount: number | null;
  latencyMs: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface NodeIo {
  fs: typeof import('fs/promises');
  path: typeof import('path');
}

const LOG_DIR_ENV_NAME = 'AI_LOG_DIR';

let nodeIoPromise: Promise<NodeIo | null> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const runtimeImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<unknown>;

function isNodeRuntime() {
  return typeof window === 'undefined'
    && typeof process !== 'undefined'
    && Boolean(process.versions?.node);
}

function sanitizePrimitive(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.startsWith('Bearer ')) {
    return 'Bearer ***';
  }

  return value;
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLog(entry));
  }

  if (!value || typeof value !== 'object') {
    return sanitizePrimitive(value);
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (/(authorization|cookie|secret|api[_-]?key|token)$/i.test(key)) {
      if (typeof raw === 'string' && raw.length > 0) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = raw;
      }
      continue;
    }

    sanitized[key] = sanitizeForLog(raw);
  }

  return sanitized;
}

async function resolveNodeIo(): Promise<NodeIo | null> {
  if (!isNodeRuntime()) {
    return null;
  }

  if (!nodeIoPromise) {
    nodeIoPromise = Promise.all([
      runtimeImport('node:fs/promises') as Promise<typeof import('fs/promises')>,
      runtimeImport('node:path') as Promise<typeof import('path')>,
    ]).then(([fs, path]) => ({ fs, path }))
      .catch(() => null);
  }

  return nodeIoPromise;
}

async function withLogDir() {
  const io = await resolveNodeIo();
  if (!io) {
    return null;
  }

  const configured = process.env[LOG_DIR_ENV_NAME]?.trim();
  const logDir = configured && configured.length > 0
    ? configured
    : io.path.join(process.cwd(), 'logs');

  await io.fs.mkdir(logDir, { recursive: true });

  return { ...io, logDir };
}

function enqueueWrite(task: () => Promise<void>) {
  writeQueue = writeQueue
    .then(task)
    .catch(() => undefined);
}

async function appendJsonLine(fileName: string, payload: unknown) {
  const context = await withLogDir();
  if (!context) {
    return;
  }

  const line = `${JSON.stringify(payload)}\n`;
  const filePath = context.path.join(context.logDir, fileName);
  await context.fs.appendFile(filePath, line, 'utf8');
}

async function writeJsonFile(fileName: string, payload: unknown) {
  const context = await withLogDir();
  if (!context) {
    return;
  }

  const filePath = context.path.join(context.logDir, fileName);
  await context.fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function maybeLifecycleEvent(entry: StructuredLogEntry): LifecycleEvent | null {
  const runId = typeof entry.runId === 'string' && entry.runId.length > 0
    ? entry.runId
    : null;

  if (!runId) {
    return null;
  }

  const message = entry.message.toLowerCase();
  let status: LifecycleStatus | null = null;

  if (message.includes('post queued') || message.includes('run created')) {
    status = 'queued';
  } else if (message.includes('processing started')) {
    status = 'running';
  } else if (message.includes('processing succeeded')) {
    status = 'succeeded';
  } else if (message.includes('failed terminally')) {
    status = 'failed';
  }

  if (!status) {
    return null;
  }

  const latency = Number(entry.durationMs ?? entry.latencyMs ?? 0);

  return {
    runId,
    traceId: typeof entry.traceId === 'string' ? entry.traceId : null,
    status,
    timestamp: entry.timestamp,
    attemptCount:
      typeof entry.attemptCount === 'number' && Number.isFinite(entry.attemptCount)
        ? entry.attemptCount
        : null,
    latencyMs: Number.isFinite(latency) && latency > 0 ? latency : null,
    errorCode: typeof entry.errorCode === 'string' ? entry.errorCode : null,
    errorMessage: typeof entry.errorMessage === 'string' ? entry.errorMessage : null,
  };
}

function routeLogFiles(entry: StructuredLogEntry) {
  if (!isNodeRuntime()) {
    return;
  }

  const scope = entry.scope.toLowerCase();
  const writes: Array<Promise<void>> = [];

  if (scope.includes('ai-provider')) {
    writes.push(appendJsonLine('provider.log', entry));
  }

  if (scope.includes('ai-worker')) {
    writes.push(appendJsonLine('worker.log', entry));
  }

  if (
    scope.includes('route')
    || scope.includes('middleware')
    || scope.includes('api')
  ) {
    writes.push(appendJsonLine('app-server.log', entry));
  }

  const lifecycle = maybeLifecycleEvent(entry);
  if (lifecycle) {
    writes.push(appendJsonLine('run-lifecycle.jsonl', lifecycle));
  }

  if (writes.length === 0) {
    return;
  }

  enqueueWrite(async () => {
    await Promise.all(writes);
  });
}

function createEntry(level: 'info' | 'error', scope: string, message: string, meta?: LogMeta): StructuredLogEntry {
  const sanitizedMeta = sanitizeForLog(meta ?? {}) as Record<string, unknown>;

  return {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizedMeta,
  };
}

function emit(entry: StructuredLogEntry) {
  const serialized = JSON.stringify(entry);

  if (entry.level === 'error') {
    // eslint-disable-next-line no-console
    console.error(serialized);
  } else {
    // eslint-disable-next-line no-console
    console.info(serialized);
  }

  routeLogFiles(entry);
}

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  emit(createEntry('info', scope, message, meta));
}

export function logError(scope: string, message: string, meta?: LogMeta) {
  emit(createEntry('error', scope, message, meta));
}

export function logRunLifecycle(event: {
  runId: string;
  traceId?: string | null;
  status: LifecycleStatus;
  timestamp?: string;
  attemptCount?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!isNodeRuntime()) {
    return;
  }

  const payload: LifecycleEvent = {
    runId: event.runId,
    traceId: event.traceId ?? null,
    status: event.status,
    timestamp: event.timestamp ?? new Date().toISOString(),
    attemptCount: typeof event.attemptCount === 'number' && Number.isFinite(event.attemptCount)
      ? event.attemptCount
      : null,
    latencyMs: typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs)
      ? event.latencyMs
      : null,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
  };

  enqueueWrite(async () => {
    await appendJsonLine('run-lifecycle.jsonl', payload);
  });
}

export function writeDbRunSnapshot(snapshot: Record<string, unknown>) {
  if (!isNodeRuntime()) {
    return;
  }

  const payload = sanitizeForLog(snapshot);
  enqueueWrite(async () => {
    await writeJsonFile('db-run-snapshot.json', payload);
  });
}

export function writeNetworkResponseSnapshot(snapshot: Record<string, unknown>) {
  if (!isNodeRuntime()) {
    return;
  }

  const payload = sanitizeForLog(snapshot);
  enqueueWrite(async () => {
    await writeJsonFile('network-response.json', payload);
  });
}
