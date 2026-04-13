import { createHash } from 'node:crypto';
import type { AiFeature, AiSubjectType } from '@/lib/ai/contracts';

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
}

export function sha256Hex(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashAiInput(payload: unknown) {
  return sha256Hex(stableSerialize(payload));
}

export function buildRunIdentity(input: {
  feature: AiFeature;
  subjectType: AiSubjectType;
  subjectId: string;
  promptVersion: string;
  promptKey: string;
  inputHash: string;
}) {
  return sha256Hex(
    [
      input.feature,
      input.subjectType,
      input.subjectId,
      input.promptVersion,
      input.promptKey,
      input.inputHash,
    ].join('::'),
  );
}
