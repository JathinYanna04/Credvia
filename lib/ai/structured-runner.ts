import type { ZodTypeAny } from 'zod';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
import { invokeProviderForStructuredOutput } from '@/lib/ai/provider-adapter';

export interface StructuredRunInput<TSchema extends ZodTypeAny> {
  schema: TSchema;
  systemPrompt: string;
  userPrompt: string;
  responseFormatInstructions: string;
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
}

function stripMarkdownFences(text: string) {
  return text
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
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

function safeParseJson(text: string) {
  const direct = text.trim();
  const withoutFences = stripMarkdownFences(direct);
  const extractedFromDirect = extractFirstJsonBlock(direct);
  const extractedFromFenceStripped = extractFirstJsonBlock(withoutFences);

  const candidates = [
    direct,
    withoutFences,
    extractedFromDirect,
    extractedFromFenceStripped,
  ]
    .filter((candidate): candidate is string => Boolean(candidate && candidate.trim().length > 0))
    .filter((candidate, index, source) => source.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Continue trying alternate extraction strategies.
    }
  }

  return null;
}

export async function runStructuredOutput<TSchema extends ZodTypeAny>(
  input: StructuredRunInput<TSchema>,
): Promise<StructuredRunResult<TSchema>> {
  const maxRepairAttempts = Math.min(1, Math.max(0, input.maxRepairAttempts ?? 1));
  let attempt = 0;
  let lastErrorMessage = 'Structured output validation failed.';
  let lastOutputText: string | null = null;
  let accumulatedLatencyMs = 0;

  const baseSystemPrompt = input.systemPrompt.trim();
  const baseUserPrompt = input.userPrompt.trim();

  while (attempt <= maxRepairAttempts) {
    const isRepairAttempt = attempt > 0;
    const repairInstructions = isRepairAttempt
      ? [
          'Repair the previous response so it strictly matches the requested JSON schema.',
          `Validation issue: ${lastErrorMessage}`,
          'Return only corrected JSON. Do not add explanation text.',
        ].join('\n')
      : null;

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
    });

    accumulatedLatencyMs += result.latencyMs;
    lastOutputText = result.outputText;

    const parsedJson = safeParseJson(result.outputText);

    if (parsedJson !== null) {
      const parsed = input.schema.safeParse(parsedJson);
      if (parsed.success) {
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
        };
      }

      lastErrorMessage = parsed.error.issues[0]?.message ?? lastErrorMessage;
    } else {
      lastErrorMessage = 'Model output was not valid JSON.';
    }

    attempt += 1;
  }

  throw new AiRuntimeError(
    'AI_OUTPUT_REPAIR_FAILED',
    'The model output did not pass schema validation after repair attempts.',
    422,
    {
      attempts: maxRepairAttempts + 1,
      lastError: lastErrorMessage,
      lastOutputPresent: Boolean(lastOutputText),
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
