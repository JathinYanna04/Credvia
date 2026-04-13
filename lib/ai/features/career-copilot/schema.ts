import { z } from 'zod';

export const CareerCopilotModeSchema = z.enum([
  'fit_explanation',
  'gap_analysis',
  'action_plan',
  'interview_questions',
]);

export type CareerCopilotMode = z.infer<typeof CareerCopilotModeSchema>;

export const CareerFitExplanationSchema = z.object({
  headline: z.string().min(8).max(180),
  summary: z.string().min(40).max(1000),
  fitScore: z.number().min(0).max(1),
  strengths: z.array(z.string().min(4).max(280)).min(2).max(8),
  concerns: z.array(z.string().min(4).max(280)).min(1).max(8),
  suggestedRoles: z.array(z.string().min(2).max(180)).min(1).max(8),
});

export const CareerGapAnalysisSchema = z.object({
  headline: z.string().min(8).max(180),
  summary: z.string().min(40).max(1000),
  strengths: z.array(z.string().min(4).max(280)).min(2).max(10),
  gaps: z.array(z.string().min(4).max(280)).min(2).max(10),
  actionSteps: z.array(z.string().min(4).max(320)).min(2).max(12),
});

export const CareerActionPlanSchema = z.object({
  headline: z.string().min(8).max(180),
  summary: z.string().min(40).max(1000),
  milestones: z.array(z.string().min(4).max(320)).min(3).max(12),
  nextWeekActions: z.array(z.string().min(4).max(320)).min(3).max(10),
  risks: z.array(z.string().min(4).max(280)).min(1).max(8),
});

export const CareerInterviewQuestionsSchema = z.object({
  headline: z.string().min(8).max(180),
  summary: z.string().min(40).max(1000),
  technicalQuestions: z.array(z.string().min(4).max(320)).min(3).max(12),
  behavioralQuestions: z.array(z.string().min(4).max(320)).min(3).max(12),
  prepTips: z.array(z.string().min(4).max(320)).min(2).max(10),
});

export const CareerCopilotOutputSchemaByMode = {
  fit_explanation: CareerFitExplanationSchema,
  gap_analysis: CareerGapAnalysisSchema,
  action_plan: CareerActionPlanSchema,
  interview_questions: CareerInterviewQuestionsSchema,
} as const;

export type CareerCopilotOutputByMode = {
  fit_explanation: z.infer<typeof CareerFitExplanationSchema>;
  gap_analysis: z.infer<typeof CareerGapAnalysisSchema>;
  action_plan: z.infer<typeof CareerActionPlanSchema>;
  interview_questions: z.infer<typeof CareerInterviewQuestionsSchema>;
};

export const CareerCopilotCreateRequestSchema = z
  .object({
    mode: CareerCopilotModeSchema,
    resumeId: z.string().uuid().optional(),
    matchId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    regenerate: z.boolean().optional(),
  })
  .strict();

export const CareerCopilotQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
});
