import type { CareerCopilotMode } from '@/lib/ai/features/career-copilot/schema';
import type { CareerCopilotPromptContext } from '@/lib/ai/features/career-copilot/context';

const MODE_GUIDANCE: Record<CareerCopilotMode, string> = {
  fit_explanation:
    'Explain role fit, confidence, strongest signals, concerns, and likely adjacent roles.',
  gap_analysis:
    'Identify concrete gaps and prioritized actions to close them.',
  action_plan:
    'Produce a practical plan with milestones and immediate next-week actions.',
  interview_questions:
    'Generate role-specific technical and behavioral interview questions with prep tips.',
};

export function buildCareerCopilotSystemPrompt(args: {
  mode: CareerCopilotMode;
  promptVersion: string;
}) {
  return [
    'You are Credvia Career Copilot.',
    'Produce structured, practical, and non-generic guidance grounded in the provided candidate and job context.',
    MODE_GUIDANCE[args.mode],
    `Prompt version: ${args.promptVersion}`,
  ].join('\n');
}

export function buildCareerCopilotUserPrompt(context: CareerCopilotPromptContext) {
  return [
    `Mode: ${context.mode}`,
    `Resume file: ${context.resumeFileName}`,
    `Current title: ${context.currentTitle ?? 'unknown'}`,
    `Years of experience: ${context.yearsExperience ?? 'unknown'}`,
    `Profile summary: ${context.profileSummary}`,
    `Top skills: ${context.skills.join(', ') || 'none'}`,
    `Experience highlights: ${context.experienceHighlights.join(' | ') || 'none'}`,
    `Education highlights: ${context.educationHighlights.join(' | ') || 'none'}`,
    `Job title: ${context.jobTitle ?? 'not provided'}`,
    `Company: ${context.companyName ?? 'not provided'}`,
    `Job location: ${context.jobLocation ?? 'not provided'}`,
    `Job description: ${context.jobDescription ?? 'not provided'}`,
    `Matched skills: ${context.matchedSkills.join(', ') || 'none'}`,
    `Missing skills: ${context.missingSkills.join(', ') || 'none'}`,
    '',
    'Keep output deterministic, concise, and practical.',
  ].join('\n');
}

export const CAREER_RESPONSE_FORMAT_INSTRUCTIONS = {
  fit_explanation: [
    'Return JSON keys: headline, summary, fitScore, strengths, concerns, suggestedRoles.',
    'fitScore must be number in [0,1].',
    'strengths, concerns, suggestedRoles must be arrays of strings.',
  ].join('\n'),
  gap_analysis: [
    'Return JSON keys: headline, summary, strengths, gaps, actionSteps.',
    'strengths, gaps, actionSteps must be arrays of strings.',
  ].join('\n'),
  action_plan: [
    'Return JSON keys: headline, summary, milestones, nextWeekActions, risks.',
    'milestones, nextWeekActions, risks must be arrays of strings.',
  ].join('\n'),
  interview_questions: [
    'Return JSON keys: headline, summary, technicalQuestions, behavioralQuestions, prepTips.',
    'technicalQuestions, behavioralQuestions, prepTips must be arrays of strings.',
  ].join('\n'),
} as const;
