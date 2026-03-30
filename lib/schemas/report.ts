import { z } from 'zod';

export const CreateReportSchema = z
  .object({
    target_type: z.enum(['post', 'comment', 'profile']),
    target_id: z.string().uuid().or(z.string().min(3)),
    reason_code: z.enum([
      'spam',
      'harassment',
      'misinformation',
      'off_topic',
      'low_quality',
      'plagiarism',
      'fraud',
      'other',
    ]),
    details: z.string().max(500).optional(),
  })
  .strict();
