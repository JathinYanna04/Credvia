import { z } from 'zod';

export const CreateCommentSchema = z
  .object({
    post_id: z.string().uuid().or(z.string().min(3)),
    parent_comment_id: z.string().uuid().optional(),
    body_md: z.string().min(1).max(10000),
  })
  .strict();

export const VoteCommentSchema = z
  .object({
    direction: z.enum(['up', 'down']),
  })
  .strict();

export const BestAnswerSchema = z
  .object({
    is_best_answer: z.boolean(),
  })
  .strict();
