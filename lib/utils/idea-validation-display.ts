import type { PostSummary } from "@/lib/types";

export interface CommunityValidationSignalInput {
  voteScore?: number;
  upvoteCount?: number;
  downvoteCount?: number;
  commentCount: number;
  saveCount: number;
  uniqueCommenters: number;
}

export interface ValidationScoreDisplay {
  pending: boolean;
  score: number | null;
  label: string;
}

function toNonNegativeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function getVoteSignalCount(input: CommunityValidationSignalInput) {
  const upvotes = toNonNegativeNumber(input.upvoteCount);
  const downvotes = toNonNegativeNumber(input.downvoteCount);

  if (upvotes > 0 || downvotes > 0) {
    return upvotes + downvotes;
  }

  const score = Number.isFinite(input.voteScore) ? input.voteScore ?? 0 : 0;
  return Math.abs(score) > 0 ? 1 : 0;
}

export function getCommunityValidationSignalCount(
  input: CommunityValidationSignalInput,
) {
  return (
    getVoteSignalCount(input) +
    toNonNegativeNumber(input.commentCount) +
    toNonNegativeNumber(input.saveCount) +
    toNonNegativeNumber(input.uniqueCommenters)
  );
}

export function hasEnoughCommunityValidationData(
  input: CommunityValidationSignalInput,
) {
  return getCommunityValidationSignalCount(input) > 0;
}

export function normalizeValidationScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

export function getValidationScoreDisplay(options: {
  score: number;
  hasEnoughData: boolean;
}): ValidationScoreDisplay {
  if (!options.hasEnoughData) {
    return {
      pending: true,
      score: null,
      label: "Community validation pending",
    };
  }

  const normalizedScore = normalizeValidationScore(options.score);

  return {
    pending: false,
    score: normalizedScore,
    label: `Community validation: ${normalizedScore}/10`,
  };
}

export type FounderAiAssessment = NonNullable<
  NonNullable<PostSummary["startupIdea"]>["aiAssessment"]
>;

const FOUNDER_VERDICT_LABELS: Record<FounderAiAssessment["verdict"], string> = {
  promising: "Promising",
  needs_work: "Needs work",
  high_risk: "High risk",
};

export function formatFounderVerdictLabel(verdict: FounderAiAssessment["verdict"]) {
  return FOUNDER_VERDICT_LABELS[verdict];
}

export function normalizeConfidencePercent(confidence: number | null | undefined) {
  if (!Number.isFinite(confidence)) {
    return null;
  }

  const bounded = Math.max(0, Math.min(1, confidence ?? 0));
  return Math.round(bounded * 100);
}

export function getFounderAssessmentDisplay(assessment: FounderAiAssessment) {
  const verdict = formatFounderVerdictLabel(assessment.verdict);
  const confidence = normalizeConfidencePercent(assessment.confidence);

  return {
    verdict,
    confidence,
    label:
      confidence === null
        ? `AI assessment: ${verdict}`
        : `AI assessment: ${verdict} (${confidence}% confidence)`,
  };
}
