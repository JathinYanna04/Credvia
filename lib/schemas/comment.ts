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
    value: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    direction: z.union([z.literal(-1), z.literal(1)]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.direction === undefined && value.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Either direction or value is required.',
      });
    }
  });

export const BestAnswerSchema = z
  .object({
    is_best_answer: z.boolean(),
  })
  .strict();
