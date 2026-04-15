import { createHash } from 'node:crypto';
import type { ZodTypeAny } from 'zod';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
import { invokeProviderForStructuredOutput } from '@/lib/ai/provider-adapter';
import { logError, logInfo } from '@/lib/utils/logger';
import { truncateForLog } from '@/lib/ai/logging/workflow';
import { buildOutputQualitySignal, type OutputQualitySignal } from '@/lib/ai/quality/confidence';

export interface StructuredRunInput<TSchema extends ZodTypeAny> {
  schema: TSchema;
  systemPrompt: string;
  userPrompt: string;
  responseFormatInstructions: string;
  maxTokens?: number;
  maxRepairAttempts?: number;
  traceId?: string;
}

export interface StructuredRunResult<TSchema extends ZodTypeAny> {
  data: ReturnType<TSchema['parse']>;
  provider: string;
  model: string;
  modelVersion: string;
  requestId: string | null;
  outputText: string;
  repairCount: number;
  latencyMs: number;
  providerMetadata: Record<string, unknown>;
  confidence: number;
  confidenceReasoning: string[];
  qualitySignal: OutputQualitySignal;
}

const DEFAULT_MAX_TOKENS = 900;
const MIN_MAX_TOKENS = 800;
const MAX_MAX_TOKENS = 1000;
const MAX_PROMPT_TOKENS = 5000;
const MAX_VALIDATION_ISSUES = 8;
const MAX_PARSE_ISSUES = 8;

interface JsonCandidate {
  label: string;
  value: string;
}

interface JsonParseOutcome {
  parsed: unknown | null;
  selectedCandidate: string | null;
  candidateCount: number;
  parseFailures: string[];
}

function resolveRequestedMaxTokens(rawMaxTokens: number | undefined) {
  const parsed = Number(rawMaxTokens);
  const normalized = Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_TOKENS;

  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, normalized));
}

function stripMarkdownFences(text: string) {
  return text
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
}

function stripJsonPrefix(text: string) {
  return text
    .replace(/^\s*(json|output)\s*:\s*/i, '')
    .trim();
}

function normalizeQuotes(text: string) {
  return text
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function removeTrailingCommas(text: string) {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function closeUnterminatedContainer(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed;
  }

  let inString = false;
  let escaping = false;
  let objectDepth = 0;
  let arrayDepth = 0;

  for (const char of trimmed) {
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      objectDepth += 1;
      continue;
    }

    if (char === '}') {
      objectDepth = Math.max(0, objectDepth - 1);
      continue;
    }

    if (char === '[') {
      arrayDepth += 1;
      continue;
    }

    if (char === ']') {
      arrayDepth = Math.max(0, arrayDepth - 1);
    }
  }

  return `${trimmed}${'}'.repeat(objectDepth)}${']'.repeat(arrayDepth)}`;
}

function extractFirstJsonBlock(text: string): string | null {
  const source = text.trim();

  for (let start = 0; start < source.length; start += 1) {
    const firstChar = source[start];
    if (firstChar !== '{' && firstChar !== '[') {
      continue;
    }

    const stack: string[] = [firstChar];
    let inString = false;
    let escaping = false;

    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === '\\') {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) {
          break;
        }

        stack.pop();
        if (stack.length === 0) {
          return source.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function buildJsonCandidates(text: string): JsonCandidate[] {
  const direct = text.trim();
  const withoutFences = stripMarkdownFences(direct);
  const withoutPrefix = stripJsonPrefix(withoutFences);
  const extractedFromDirect = extractFirstJsonBlock(direct);
  const extractedFromFenceStripped = extractFirstJsonBlock(withoutFences);

  const rawCandidates: JsonCandidate[] = [
    { label: 'direct', value: direct },
    { label: 'fence-stripped', value: withoutFences },
    { label: 'prefix-stripped', value: withoutPrefix },
    { label: 'json-block-direct', value: extractedFromDirect ?? '' },
    { label: 'json-block-fence-stripped', value: extractedFromFenceStripped ?? '' },
  ];

  const seen = new Set<string>();
  const candidates: JsonCandidate[] = [];

  for (const candidate of rawCandidates) {
    const base = normalizeQuotes(candidate.value).trim();
    if (!base) {
      continue;
    }

    const variants = [
      { label: candidate.label, value: base },
      { label: `${candidate.label}-trailing-commas-fixed`, value: removeTrailingCommas(base) },
      { label: `${candidate.label}-closed`, value: closeUnterminatedContainer(base) },
      {
        label: `${candidate.label}-closed-trailing-commas-fixed`,
        value: removeTrailingCommas(closeUnterminatedContainer(base)),
      },
    ];

    for (const variant of variants) {
      const normalized = variant.value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      candidates.push({ label: variant.label, value: normalized });
    }
  }

  return candidates;
}

function safeParseJson(text: string): JsonParseOutcome {
  const candidates = buildJsonCandidates(text);
  const parseFailures: string[] = [];

  for (const candidate of candidates) {
    try {
      return {
        parsed: JSON.parse(candidate.value) as unknown,
        selectedCandidate: candidate.label,
        candidateCount: candidates.length,
        parseFailures,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'JSON parse failed.';
      parseFailures.push(`${candidate.label}: ${reason}`);
    }
  }

  return {
    parsed: null,
    selectedCandidate: null,
    candidateCount: candidates.length,
    parseFailures: parseFailures.slice(0, MAX_PARSE_ISSUES),
  };
}

function formatValidationIssues(issues: Array<{ path: Array<string | number>; message: string }>) {
  return issues
    .slice(0, MAX_VALIDATION_ISSUES)
    .map((issue) => {
      const issuePath = issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : 'root';
      return `${issuePath}: ${issue.message}`;
    });
}

function hashOutput(text: string | null) {
  if (!text) {
    return null;
  }

  return createHash('sha256').update(text).digest('hex');
}

function buildRepairInstructions(args: {
  lastErrorMessage: string;
  parseIssues: string[];
  validationIssues: string[];
}) {
  const issueLines = [
    ...args.validationIssues.map((issue) => `- validation: ${issue}`),
    ...args.parseIssues.map((issue) => `- parse: ${issue}`),
  ].slice(0, 8);

  return [
    'REPAIR MODE: Correct the previous response so it is valid JSON and schema-compatible.',
    'Return JSON only. No markdown. No explanation.',
    'Do not rename keys unless needed to match the schema contract.',
    'Prefer fixing shape/types over adding extra commentary.',
    `Primary failure signal: ${args.lastErrorMessage}`,
    issueLines.length > 0 ? `Observed issues:\n${issueLines.join('\n')}` : 'Observed issues: unavailable.',
  ].join('\n');
}

export async function runStructuredOutput<TSchema extends ZodTypeAny>(
  input: StructuredRunInput<TSchema>,
): Promise<StructuredRunResult<TSchema>> {
  const maxRepairAttempts = Math.min(3, Math.max(0, input.maxRepairAttempts ?? 1));
  const maxTokens = resolveRequestedMaxTokens(input.maxTokens);
  let attempt = 0;
  let lastErrorMessage = 'Structured output validation failed.';
  let lastOutputText: string | null = null;
  let accumulatedLatencyMs = 0;
  let parseFailureCount = 0;
  let validationFailureCount = 0;
  let lastValidationIssues: string[] = [];
  let lastParseIssues: string[] = [];
  let lastParsedCandidate: string | null = null;
  let lastProvider: string | null = null;
  let lastModel: string | null = null;
  let lastRequestId: string | null = null;

  const baseSystemPrompt = input.systemPrompt.trim();
  const baseUserPrompt = input.userPrompt.trim();
  const systemPromptLength = baseSystemPrompt.length;
  const userPromptLength = baseUserPrompt.length;
  const responseFormatLength = input.responseFormatInstructions.trim().length;
  const totalPromptCharacters = systemPromptLength + userPromptLength + responseFormatLength;
  const estimatedPromptTokens = Math.max(0, Math.ceil(totalPromptCharacters / 4));
  const oversizedContext = estimatedPromptTokens > MAX_PROMPT_TOKENS;
  const totalTokensExpected = estimatedPromptTokens + maxTokens;

  logInfo('ai-structured-runner', 'Structured output run started', {
    traceId: input.traceId ?? null,
    maxRepairAttempts,
    requestBudget: {
      systemPromptLength,
      userPromptLength,
      responseFormatLength,
      totalPromptCharacters,
      estimatedPromptTokens,
      maxTokensRequested: maxTokens,
      totalTokensExpected,
      oversizedContext,
    },
  });

  while (attempt <= maxRepairAttempts) {
    const isRepairAttempt = attempt > 0;
    const repairInstructions = isRepairAttempt
      ? buildRepairInstructions({
          lastErrorMessage,
          parseIssues: lastParseIssues,
          validationIssues: lastValidationIssues,
        })
      : null;

    if (isRepairAttempt) {
      logInfo('ai-structured-runner', 'Structured output repair prompt issued', {
        traceId: input.traceId ?? null,
        attempt,
        repairCount: attempt,
        lastError: lastErrorMessage,
        parseIssues: lastParseIssues,
        validationIssues: lastValidationIssues,
      });
    }

    logInfo('ai-structured-runner', 'Structured output provider invocation starting', {
      traceId: input.traceId ?? null,
      attempt,
      isRepairAttempt,
      maxTokens,
      systemPromptLength: baseSystemPrompt.length,
      userPromptLength: baseUserPrompt.length,
      responseFormatLength: input.responseFormatInstructions.trim().length,
      hasLastOutputContext: Boolean(isRepairAttempt && lastOutputText),
    });

    const result = await invokeProviderForStructuredOutput({
      systemPrompt: [baseSystemPrompt, repairInstructions].filter(Boolean).join('\n\n'),
      userPrompt: isRepairAttempt && lastOutputText
        ? [
            baseUserPrompt,
            'Previous invalid model output:',
            lastOutputText,
          ].join('\n\n')
        : baseUserPrompt,
      responseFormatInstructions: input.responseFormatInstructions,
      traceId: input.traceId,
      maxTokens,
    });

    accumulatedLatencyMs += result.latencyMs;
    lastOutputText = result.outputText;
    lastProvider = result.provider;
    lastModel = result.modelVersion;
    lastRequestId = result.requestId;

    logInfo('ai-provider', 'Structured output attempt metadata', {
      traceId: input.traceId ?? null,
      attempt,
      isRepairAttempt,
      provider: result.provider,
      model: result.modelVersion,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
      outputLength: result.outputText.length,
    });

    logInfo('ai-structured-runner', 'Structured output provider response received', {
      traceId: input.traceId ?? null,
      attempt,
      isRepairAttempt,
      provider: result.provider,
      model: result.modelVersion,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
    });

    const parsedJson = safeParseJson(result.outputText);
    lastParsedCandidate = parsedJson.selectedCandidate;

    if (parsedJson.parsed !== null) {
      const parsed = input.schema.safeParse(parsedJson.parsed);
      if (parsed.success) {
        const providerAttemptCount = Number(
          (result.providerMetadata as { attemptCount?: unknown } | undefined)?.attemptCount ?? 1,
        );
        const qualitySignal = buildOutputQualitySignal({
          parsedOutput: parsed.data,
          outputText: result.outputText,
          repairCount: attempt,
          providerAttemptCount: Number.isFinite(providerAttemptCount) ? providerAttemptCount : 1,
          parseFailureCount,
          validationFailureCount,
        });

        logInfo('ai-structured-runner', 'Structured output validation succeeded', {
          traceId: input.traceId ?? null,
          attempt,
          repairCount: attempt,
          totalLatencyMs: accumulatedLatencyMs,
          outputConfidence: qualitySignal.confidence,
          outputStability: qualitySignal.stability,
          providerAttempts: qualitySignal.providerAttemptCount,
        });

        return {
          data: parsed.data as ReturnType<TSchema['parse']>,
          provider: result.provider,
          model: result.model,
          modelVersion: result.modelVersion,
          requestId: result.requestId,
          outputText: result.outputText,
          repairCount: attempt,
          latencyMs: accumulatedLatencyMs,
          providerMetadata: result.providerMetadata,
          confidence: qualitySignal.confidence,
          confidenceReasoning: qualitySignal.reasoning,
          qualitySignal,
        };
      }

      validationFailureCount += 1;
      lastValidationIssues = formatValidationIssues(parsed.error.issues);
      lastParseIssues = [];
      lastErrorMessage = lastValidationIssues[0] ?? parsed.error.issues[0]?.message ?? lastErrorMessage;

      logInfo('ai-structured-runner', 'Structured output validation failed', {
        traceId: input.traceId ?? null,
        attempt,
        isRepairAttempt,
        validationIssue: lastErrorMessage,
        validationIssues: lastValidationIssues,
        parsedCandidate: parsedJson.selectedCandidate,
      });
    } else {
      parseFailureCount += 1;
      lastParseIssues = parsedJson.parseFailures;
      lastValidationIssues = [];
      lastErrorMessage = parsedJson.parseFailures[0] ?? 'Model output was not valid JSON.';

      logInfo('ai-structured-runner', 'Structured output parsing failed', {
        traceId: input.traceId ?? null,
        attempt,
        isRepairAttempt,
        parseIssue: lastErrorMessage,
        parseIssues: parsedJson.parseFailures,
        candidateCount: parsedJson.candidateCount,
      });
    }

    attempt += 1;
  }

  logError('ai-structured-runner', 'Structured output exhausted repair attempts', {
    traceId: input.traceId ?? null,
    attempts: maxRepairAttempts + 1,
    lastError: lastErrorMessage,
    provider: lastProvider,
    model: lastModel,
    requestId: lastRequestId,
    repairCount: maxRepairAttempts,
    parseIssues: lastParseIssues,
    validationIssues: lastValidationIssues,
    parsedCandidate: lastParsedCandidate,
    lastOutputHash: hashOutput(lastOutputText),
    lastOutputLength: lastOutputText?.length ?? 0,
    lastOutputPreview: lastOutputText ? truncateForLog(lastOutputText, 500) : null,
    parseFailureCount,
    validationFailureCount,
  });

  throw new AiRuntimeError(
    'AI_OUTPUT_REPAIR_FAILED',
    'The model output did not pass schema validation after repair attempts.',
    422,
    {
      attempts: maxRepairAttempts + 1,
      repairCount: maxRepairAttempts,
      provider: lastProvider,
      model: lastModel,
      requestId: lastRequestId,
      lastError: lastErrorMessage,
      lastOutputPresent: Boolean(lastOutputText),
      lastOutputHash: hashOutput(lastOutputText),
      lastOutputLength: lastOutputText?.length ?? 0,
      lastOutputPreview: lastOutputText ? truncateForLog(lastOutputText, 500) : null,
      parseIssues: lastParseIssues,
      validationIssues: lastValidationIssues,
      parsedCandidate: lastParsedCandidate,
      parseFailureCount,
      validationFailureCount,
    },
    'Retry the run with a stricter schema-aligned prompt.',
  );
}

export function toApiErrorDetails(error: unknown) {
  if (isAiRuntimeError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
      suggestedAction: error.suggestedAction,
    };
  }

  return null;
}
