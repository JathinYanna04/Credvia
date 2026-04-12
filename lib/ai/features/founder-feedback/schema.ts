import { z } from 'zod';

const FounderVerdictSchema = z.enum(['promising', 'needs_work', 'high_risk']);
const FounderEvidenceSourceSchema = z.enum(['idea', 'revision', 'discussion', 'market']);

const FounderShortLineSchema = z.string().trim().min(3).max(320);
const FounderNarrativeSchema = z.string().trim().min(18).max(900);
const FounderOptionalNarrativeSchema = z.string().trim().min(8).max(420).nullable().optional();

export const FounderEvidenceItemSchema = z.object({
  claim: z.string().trim().min(1).max(320),
  evidence: z.string().trim().min(1).max(800),
  source: FounderEvidenceSourceSchema,
  confidence: z.number().min(0).max(1),
});

export const FounderIdeaReviewSchema = z.object({
  verdict: FounderVerdictSchema.default('needs_work'),
  confidence: z.number().min(0).max(1).default(0.55),
  summary: z.string().trim().min(8).max(900),
  rewrite: z.string().trim().min(8).max(5000).nullable().optional(),
  strengths: z.array(z.string().trim().min(3).max(280)).max(8).default([]),
  risks: z.array(z.string().trim().min(3).max(280)).max(8).default([]),
  suggestions: z.array(FounderShortLineSchema).max(10).default([]),
  marketSignals: z.array(FounderShortLineSchema).max(8).default([]),
  reasoning: z.array(z.string().trim().min(3).max(480)).max(8).default([]),
  evidence: z.array(FounderEvidenceItemSchema).max(10).default([]),
  investorPushback: z.array(FounderShortLineSchema).max(8).nullable().optional(),
  bestNextExperiment: FounderOptionalNarrativeSchema,
  communityRead: FounderOptionalNarrativeSchema,
  moatConcern: FounderOptionalNarrativeSchema,
});

export type FounderIdeaReview = z.infer<typeof FounderIdeaReviewSchema>;

const FounderFallbackEvidenceItemSchema = z.object({
  claim: z.string().trim().min(1).max(320),
  evidence: z.string().trim().min(1).max(800),
  source: FounderEvidenceSourceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const FounderIdeaReviewFallbackSchema = z.object({
  verdict: FounderVerdictSchema.default('needs_work'),
  confidence: z.number().min(0).max(1).default(0.55),
  summary: z.string().trim().min(6).max(900),
  rewrite: z.string().trim().min(12).max(5000).nullable().optional(),
  strengths: z.array(z.string().trim().min(2).max(280)).max(8).default([]),
  risks: z.array(z.string().trim().min(2).max(280)).max(8).default([]),
  suggestions: z.array(z.string().trim().min(2).max(320)).max(10).default([]),
  marketSignals: z.array(z.string().trim().min(2).max(320)).max(8).default([]),
  reasoning: z.array(z.string().trim().min(2).max(480)).max(8).default([]),
  evidence: z.array(FounderFallbackEvidenceItemSchema).max(10).default([]),
  investorPushback: z.array(z.string().trim().min(2).max(320)).max(8).optional(),
  bestNextExperiment: z.string().trim().min(2).max(420).nullable().optional(),
  communityRead: z.string().trim().min(2).max(420).nullable().optional(),
  moatConcern: z.string().trim().min(2).max(420).nullable().optional(),
});

export type FounderIdeaReviewFallback = z.infer<typeof FounderIdeaReviewFallbackSchema>;

function toRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function parseJsonLikeRaw(rawOutput: string | null | undefined): Record<string, unknown> | null {
  const text = (rawOutput ?? '').trim();
  if (!text) {
    return null;
  }

  const noFence = stripMarkdownFences(text);
  const noPrefix = stripJsonPrefix(noFence);
  const extracted = extractFirstJsonBlock(noPrefix) ?? extractFirstJsonBlock(noFence);

  const candidates = [noPrefix, extracted ?? '', closeUnterminatedContainer(noPrefix)]
    .map((candidate) => removeTrailingCommas(normalizeQuotes(candidate.trim())))
    .filter((candidate): candidate is string => candidate.length > 0);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const record = toRecord(parsed);
      if (Object.keys(record).length > 0) {
        return record;
      }
    } catch {
      // Continue with next candidate.
    }
  }

  return null;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toStringArrayValue(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function toRawFallbackEvidence(value: unknown): FounderIdeaReviewFallback['evidence'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const claim = toStringValue(record.claim);
      const evidence = toStringValue(record.evidence);

      if (!claim || !evidence) {
        return null;
      }

      const source = toStringValue(record.source);
      const confidence = Number(record.confidence);

      return {
        claim,
        evidence,
        source: source === 'idea' || source === 'revision' || source === 'discussion' || source === 'market'
          ? source
          : undefined,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
      };
    })
    .filter((item): item is NonNullable<FounderIdeaReviewFallback['evidence'][number]> => Boolean(item))
    .slice(0, 10);
}

function clampConfidence(value: number | null | undefined, fallback = 0.55) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeLines(items: string[] | null | undefined, maxItems: number) {
  const normalized = Array.isArray(items)
    ? items
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function ensureOneLiner(summary: string) {
  const trimmed = summary.trim();
  if (trimmed.toLowerCase().startsWith('one-liner:')) {
    return trimmed;
  }

  return `One-liner: ${trimmed}`;
}

function ensureRewrite(rewrite: string | null | undefined, summary: string) {
  const normalized = (rewrite ?? '').trim();
  if (normalized.length > 0 && normalized.includes('Title:') && normalized.includes('Body:')) {
    return normalized;
  }

  const body = normalized.length > 0 ? normalized : summary;
  return `Title: Sharpened Founder Thesis\nBody: ${body}`;
}

function ensureEvidence(
  evidence: FounderIdeaReviewFallback['evidence'],
  summary: string,
): FounderIdeaReview['evidence'] {
  const normalized = (evidence ?? [])
    .map((item) => ({
      claim: item.claim.trim(),
      evidence: item.evidence.trim(),
      source: item.source ?? 'idea',
      confidence: clampConfidence(item.confidence, 0.55),
    }))
    .filter((item) => item.claim.length > 0 && item.evidence.length > 0)
    .slice(0, 10);

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      claim: 'Core thesis needs stronger external proof.',
      evidence: summary.slice(0, 240),
      source: 'idea',
      confidence: 0.55,
    },
  ];
}

export function normalizeFounderFallbackReview(review: FounderIdeaReviewFallback): FounderIdeaReview {
  const summary = ensureOneLiner(review.summary);
  const strengths = normalizeLines(review.strengths, 8);
  const risks = normalizeLines(review.risks, 8);
  const reasoning = normalizeLines(review.reasoning, 8);
  const marketSignals = normalizeLines(review.marketSignals, 8);

  const suggestions = normalizeLines(review.suggestions, 10);
  if (!suggestions.some((item) => item.toLowerCase().startsWith('missing answer:'))) {
    suggestions.unshift('Missing answer: What specific trigger will make this buyer switch now?');
  }
  if (!suggestions.some((item) => item.toLowerCase().startsWith('next step experiment:'))) {
    suggestions.push('Next step experiment: Run 10 buyer interviews and record conversion intent by segment.');
  }

  return {
    verdict: review.verdict,
    confidence: clampConfidence(review.confidence, 0.55),
    summary,
    rewrite: ensureRewrite(review.rewrite, summary),
    strengths,
    risks,
    suggestions: suggestions.slice(0, 10),
    marketSignals,
    reasoning,
    evidence: ensureEvidence(review.evidence, summary),
    investorPushback: normalizeLines(review.investorPushback, 8),
    bestNextExperiment: review.bestNextExperiment ?? null,
    communityRead: review.communityRead ?? null,
    moatConcern: review.moatConcern ?? null,
  };
}

export function mapFounderReviewFromRawOutput(args: {
  rawOutput: string | null | undefined;
  fallbackSummary?: string | null;
}): FounderIdeaReview {
  const rawText = (args.rawOutput ?? '').trim();
  const parsedRecord = parseJsonLikeRaw(rawText);

  const summaryCandidate = toStringValue(parsedRecord?.summary)
    ?? toStringValue(args.fallbackSummary)
    ?? (rawText.length > 0
      ? `One-liner: ${rawText.replace(/\s+/g, ' ').slice(0, 220)}`
      : 'One-liner: Output parsing failed, but core founder feedback was partially recovered.');

  const fallbackShape: FounderIdeaReviewFallback = {
    verdict: (toStringValue(parsedRecord?.verdict) === 'promising'
      || toStringValue(parsedRecord?.verdict) === 'needs_work'
      || toStringValue(parsedRecord?.verdict) === 'high_risk')
      ? (toStringValue(parsedRecord?.verdict) as FounderIdeaReviewFallback['verdict'])
      : 'needs_work',
    confidence: (() => {
      const value = Number(parsedRecord?.confidence);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.45;
    })(),
    summary: summaryCandidate,
    rewrite: toStringValue(parsedRecord?.rewrite),
    strengths: toStringArrayValue(parsedRecord?.strengths, 8),
    risks: toStringArrayValue(parsedRecord?.risks, 8),
    suggestions: toStringArrayValue(parsedRecord?.suggestions, 10),
    marketSignals: toStringArrayValue(parsedRecord?.marketSignals, 8),
    reasoning: toStringArrayValue(parsedRecord?.reasoning, 8),
    evidence: toRawFallbackEvidence(parsedRecord?.evidence),
    investorPushback: toStringArrayValue(parsedRecord?.investorPushback, 8),
    bestNextExperiment: toStringValue(parsedRecord?.bestNextExperiment),
    communityRead: toStringValue(parsedRecord?.communityRead),
    moatConcern: toStringValue(parsedRecord?.moatConcern),
  };

  return normalizeFounderFallbackReview(fallbackShape);
}

export const FounderReviewRequestSchema = z
  .object({
    regenerate: z.boolean().optional(),
    forceNewRun: z.boolean().optional(),
  })
  .strict();

export const FounderReviewRouteParamsSchema = z.object({
  id: z.string().uuid(),
});
