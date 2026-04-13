export interface OutputQualitySignal {
  confidence: number;
  reasoning: string[];
  stability: 'high' | 'medium' | 'low';
  repairCount: number;
  providerAttemptCount: number;
  parseFailureCount: number;
  validationFailureCount: number;
  missingFieldCount: number;
  outputLength: number;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function countMissingSignals(value: unknown): number {
  if (value === null || value === undefined) {
    return 1;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0 ? 1 : 0;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 1;
    }

    return value.reduce<number>((total, item) => total + countMissingSignals(item), 0);
  }

  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>);
    if (entries.length === 0) {
      return 1;
    }

    return entries.reduce<number>((total, item) => total + countMissingSignals(item), 0);
  }

  return 0;
}

function toStability(score: number): OutputQualitySignal['stability'] {
  if (score >= 0.8) {
    return 'high';
  }

  if (score >= 0.55) {
    return 'medium';
  }

  return 'low';
}

export function buildOutputQualitySignal(args: {
  parsedOutput: unknown;
  outputText: string;
  repairCount: number;
  providerAttemptCount: number;
  parseFailureCount: number;
  validationFailureCount: number;
}): OutputQualitySignal {
  const missingFieldCount = countMissingSignals(args.parsedOutput);
  let score = 1;
  const reasoning: string[] = [];

  if (args.repairCount > 0) {
    score -= Math.min(0.45, args.repairCount * 0.12);
    reasoning.push(`Repair attempts used: ${args.repairCount}.`);
  } else {
    reasoning.push('No output repair needed.');
  }

  if (args.providerAttemptCount > 1) {
    score -= Math.min(0.35, (args.providerAttemptCount - 1) * 0.1);
    reasoning.push(`Provider retries used: ${args.providerAttemptCount - 1}.`);
  } else {
    reasoning.push('Provider returned on first attempt.');
  }

  if (args.parseFailureCount > 0) {
    score -= Math.min(0.25, args.parseFailureCount * 0.08);
    reasoning.push(`Parse failures observed: ${args.parseFailureCount}.`);
  }

  if (args.validationFailureCount > 0) {
    score -= Math.min(0.2, args.validationFailureCount * 0.05);
    reasoning.push(`Schema validation failures observed: ${args.validationFailureCount}.`);
  }

  if (missingFieldCount > 0) {
    score -= Math.min(0.3, missingFieldCount * 0.015);
    reasoning.push(`Potentially weak or missing fields detected: ${missingFieldCount}.`);
  } else {
    reasoning.push('No missing or empty output fields detected.');
  }

  const confidence = Number(clamp01(score).toFixed(2));

  return {
    confidence,
    reasoning,
    stability: toStability(confidence),
    repairCount: args.repairCount,
    providerAttemptCount: Math.max(1, args.providerAttemptCount),
    parseFailureCount: args.parseFailureCount,
    validationFailureCount: args.validationFailureCount,
    missingFieldCount,
    outputLength: args.outputText.length,
  };
}
