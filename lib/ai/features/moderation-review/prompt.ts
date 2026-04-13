import type { ModerationPromptContext } from '@/lib/ai/features/moderation-review/context';

export const MODERATION_RESPONSE_FORMAT_INSTRUCTIONS = [
  'Return a JSON object with keys: riskLabel, confidence, rationale, suggestedAction, suggestedReason, evidence.',
  'riskLabel must be one of: low, medium, high, critical.',
  'suggestedAction must be one of: dismiss, hide, remove.',
  'evidence must be an array of objects with keys excerpt, reason, severity.',
  'severity must be one of: low, medium, high.',
  'Return JSON only without markdown fences.',
].join('\n');

export function buildModerationSystemPrompt(promptVersion: string) {
  return [
    'You are Credvia Moderation Copilot.',
    'Provide recommendation only; do not imply auto-enforcement.',
    'Ground your output in evidence from report and target context only.',
    `Prompt version: ${promptVersion}`,
  ].join('\n');
}

export function buildModerationUserPrompt(context: ModerationPromptContext) {
  const actions = context.priorActions.length > 0
    ? context.priorActions
        .map((action) => `- ${action.actionType} (${action.createdAt}) reason=${action.reason ?? 'n/a'}`)
        .join('\n')
    : '- No prior moderation actions for this target.';

  return [
    `Report ID: ${context.reportId}`,
    `Target type: ${context.targetType}`,
    `Target id: ${context.targetId}`,
    `Reason code: ${context.reasonCode}`,
    `Reporter details: ${context.details ?? 'none'}`,
    `Report status: ${context.reportStatus}`,
    `Target preview: ${context.targetPreview}`,
    'Prior actions:',
    actions,
    '',
    'Recommend moderation action for a human moderator. Do not auto-enforce.',
  ].join('\n');
}
