import type { FounderIdeaPromptContext } from '@/lib/ai/features/founder-feedback/context';

export const FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS = [
  'STRICT JSON ONLY: return exactly one JSON object and nothing else.',
  'Do not include markdown fences.',
  'Required keys: verdict, confidence, summary.',
  'All other keys are optional: rewrite, strengths, risks, suggestions, marketSignals, reasoning, evidence, investorPushback, bestNextExperiment, communityRead, moatConcern.',
  'Allowed verdict values: promising, needs_work, high_risk.',
  'confidence must be a number in [0, 1].',
  'summary must start with "One-liner:".',
  'If optional arrays are unknown, return [].',
  'If optional text fields are unknown, return null.',
  'rewrite, if present, should include both labels exactly: "Title:" and "Body:".',
  'strengths, risks, suggestions, marketSignals, reasoning must be arrays of strings.',
  'evidence, if present, must be an array of objects with fields claim, evidence, source, confidence.',
  'source must be one of: idea, revision, discussion, market.',
  'When uncertain, prefer empty arrays or null optional values instead of inventing facts.',
  'No extra keys.',
  'Minimal valid example:',
  '{"verdict":"needs_work","confidence":0.62,"summary":"One-liner: Problem exists, but distribution proof is currently weak."}',
].join('\n');

export const FOUNDER_RESPONSE_FALLBACK_FORMAT_INSTRUCTIONS = [
  'STRICT JSON ONLY. Return exactly one JSON object.',
  'Required keys: verdict, confidence, summary.',
  'Optional keys: rewrite, strengths, risks, suggestions, marketSignals, reasoning, evidence, investorPushback, bestNextExperiment, communityRead, moatConcern.',
  'summary must start with "One-liner:".',
  'If unknown, use [] for arrays and null for optional fields.',
  'Do not include extra keys.',
].join('\n');

function compactText(value: string, maxLength: number) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeForDedupe(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildFounderIdeaSystemPrompt(promptVersion: string) {
  return [
    'You are Credvia Founder Copilot.',
    'Operate like a sharp early-stage product reviewer and pre-seed investor: direct, specific, and high-signal.',
    'Default stance: skeptical but constructive. Reward clarity, punish vagueness.',
    'Hard constraints:',
    '- No generic praise or motivational filler.',
    '- No fabricated market statistics, TAM numbers, or traction claims.',
    '- No invented customer quotes, competitors, or distribution channels.',
    '- No buzzword soup (e.g. synergy, disruptive, game-changer) unless directly quoted from context.',
    '- Every major claim must tie to supplied idea, revisions, or discussion context.',
    '- If evidence is missing, explicitly state the missing proof and lower confidence.',
    'Quality bar by field:',
    '- verdict: punchy and specific to the failure mode or strength profile.',
    '- strengths: concrete advantages already present in context, not hypothetical upside.',
    '- risks: concrete failure points (adoption, distribution, economics, defensibility, execution, regulation, trust).',
    '- suggestions: include probing investor-style missing answers and testable next experiments.',
    '- rewrite: materially improve positioning, differentiation, and buyer clarity.',
    'Style examples (few-shot):',
    'Bad: "This has potential and could do well if executed strongly."',
    'Better: "One-liner: Strong founder pain statement, but no proof that this ICP will switch from current workflow."',
    'Bad risk: "Competition is high."',
    'Better risk: "Distribution risk: no acquisition channel is specified, so CAC assumptions are ungrounded."',
    `Prompt version: ${promptVersion}`,
  ].join('\n');
}

export function buildFounderIdeaUserPrompt(context: FounderIdeaPromptContext) {
  const ideaTitle = compactText(context.title, 180);
  const ideaBody = compactText(context.body, 1400);
  const ideaProblem = compactText(context.problem, 380);
  const ideaAudience = compactText(context.targetAudience, 320);
  const ideaSolution = compactText(context.solution, 420);
  const ideaMarketCategory = compactText(context.marketCategory, 220);

  const seenSegments = new Set<string>([
    normalizeForDedupe(ideaTitle),
    normalizeForDedupe(ideaBody),
    normalizeForDedupe(ideaProblem),
    normalizeForDedupe(ideaAudience),
    normalizeForDedupe(ideaSolution),
    normalizeForDedupe(ideaMarketCategory),
  ].filter((value) => value.length > 0));

  const revisionLines = context.revisions
    .slice(0, 1)
    .map((revision) => {
      const compactRevisionTitle = compactText(revision.title, 160);
      const compactRevisionBody = compactText(revision.body, 420);
      const compactRevisionSummary = compactText(revision.changeSummary ?? 'n/a', 220);

      const revisionKey = normalizeForDedupe(
        `${compactRevisionTitle} ${compactRevisionSummary} ${compactRevisionBody}`,
      );

      if (!revisionKey || seenSegments.has(revisionKey)) {
        return null;
      }

      seenSegments.add(revisionKey);

      return `- Revision ${revision.revisionNumber} (${revision.createdAt}): ${compactRevisionTitle}\n  Change summary: ${compactRevisionSummary}\n  Body: ${compactRevisionBody}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n') || '- No revisions yet.';

  const discussionLines = context.topComments
    .slice(0, 2)
    .map((comment, index) => {
      const compactCommentBody = compactText(comment.body, 260);
      const commentKey = normalizeForDedupe(compactCommentBody);

      if (!commentKey || seenSegments.has(commentKey)) {
        return null;
      }

      seenSegments.add(commentKey);

      return `- Comment ${index + 1} (score ${comment.voteScore}, ${comment.createdAt}): ${compactCommentBody}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n') || '- No community discussion yet.';

  return [
    'Assess this startup idea and produce hard-nosed founder feedback.',
    'Ground every point in the provided context only.',
    '',
    `Idea title: ${ideaTitle}`,
    `Idea body: ${ideaBody}`,
    `Problem: ${ideaProblem}`,
    `Target audience: ${ideaAudience}`,
    `Solution: ${ideaSolution}`,
    `Market category: ${ideaMarketCategory}`,
    `Stage: ${context.stage}`,
    `Monetization: ${context.monetizationModel ?? 'not specified'}`,
    `Validation score: ${context.validationScore}`,
    `Comment count: ${context.commentCount}`,
    '',
    'Revisions:',
    revisionLines,
    '',
    'Top discussion:',
    discussionLines,
    '',
    'Requirements:',
    '- Summary starts with "One-liner:" and states the thesis in plain English.',
    '- Verdict must match evidence quality, not optimism.',
    '- Strengths must cite concrete details that already exist in this idea.',
    '- Risks must identify explicit failure points and what would invalidate the idea.',
    '- Suggestions must include investor-style pushback as "Missing answer:" entries.',
    '- Suggestions must include operational tests as "Next step experiment:" entries with measurable outcomes.',
    '- Rewrite must be materially better and include labeled sections exactly: "Title:" then "Body:".',
    '- Market signals should be observations, not fabricated stats.',
    '- Evidence entries must quote or tightly paraphrase supplied context with accurate source tags.',
    '- If any field is uncertain, return structurally valid JSON with concise placeholders instead of dropping keys.',
    '- Keep tone crisp and non-flattering. Avoid generic startup advice.',
  ].join('\n');
}
