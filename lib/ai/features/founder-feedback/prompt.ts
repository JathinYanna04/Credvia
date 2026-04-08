import type { FounderIdeaPromptContext } from '@/lib/ai/features/founder-feedback/context';

export const FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS = [
  'Return one JSON object only.',
  'Required keys:',
  'verdict, confidence, summary, rewrite, strengths, risks, suggestions, marketSignals, reasoning, evidence.',
  'Optional keys:',
  'investorPushback, bestNextExperiment, communityRead, moatConcern.',
  'confidence must be a number in [0,1].',
  'strengths, risks, suggestions, marketSignals, reasoning must be string arrays.',
  'evidence must be an array of objects with keys claim, evidence, source, confidence.',
  'source must be one of: idea, revision, discussion, market.',
  'summary must begin with "One-liner:" and be concrete, not motivational.',
  'rewrite must include two labeled sections: "Title:" and "Body:".',
  'suggestions must include at least one item prefixed "Missing answer:" and one item prefixed "Next step experiment:".',
  'Do not include extra keys beyond the required and optional keys listed above.',
].join('\n');

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
  const revisionLines = context.revisions.length > 0
    ? context.revisions
        .map(
          (revision) =>
            `- Revision ${revision.revisionNumber} (${revision.createdAt}): ${revision.title}\n  Change summary: ${revision.changeSummary ?? 'n/a'}\n  Body: ${revision.body.slice(0, 900)}`,
        )
        .join('\n')
    : '- No revisions yet.';

  const discussionLines = context.topComments.length > 0
    ? context.topComments
        .map(
          (comment, index) =>
            `- Comment ${index + 1} (score ${comment.voteScore}, ${comment.createdAt}): ${comment.body.slice(0, 500)}`,
        )
        .join('\n')
    : '- No community discussion yet.';

  return [
    'Assess this startup idea and produce hard-nosed founder feedback.',
    'Ground every point in the provided context only.',
    '',
    `Idea title: ${context.title}`,
    `Idea body: ${context.body}`,
    `Problem: ${context.problem}`,
    `Target audience: ${context.targetAudience}`,
    `Solution: ${context.solution}`,
    `Market category: ${context.marketCategory}`,
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
    '- Keep tone crisp and non-flattering. Avoid generic startup advice.',
  ].join('\n');
}
