import { z } from "zod";

export const PostTypeSchema = z.enum([
  "question",
  "discussion",
  "project_showcase",
  "resource",
  "opportunity",
  "resume_review",
  "looking_for_collaborator",
  "startup_idea",
]);

export const StartupIdeaStageSchema = z.enum([
  "idea",
  "problem_validation",
  "mvp_building",
  "early_users",
]);

export const StartupIdeaSchema = z
  .object({
    problem: z.string().min(20).max(500),
    target_audience: z.string().min(10).max(200),
    solution: z.string().min(20).max(1000),
    market_category: z.string().min(2).max(80),
    stage: StartupIdeaStageSchema,
    monetization_model: z.string().max(120).optional(),
    existing_alternatives: z.string().min(10).max(600).optional(),
    differentiation: z.string().min(10).max(600).optional(),
    evidence_of_problem: z.string().min(10).max(600).optional(),
    biggest_risk_assumption: z.string().min(10).max(600).optional(),
    supporting_evidence_links: z.array(z.string().url()).max(8).optional(),
  })
  .strict();

export const CreatePostSchema = z
  .object({
    title: z.string().min(10).max(300),
    post_type: PostTypeSchema,
    community_id: z.string().uuid().or(z.string().min(3)),
    body_md: z.string().min(1).max(20000).optional(),
    external_url: z.string().url().optional().or(z.literal("")),
    tags: z.array(z.string()).max(5).optional(),
    media_url: z.string().url().optional(),
    startup_idea: StartupIdeaSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.post_type === "startup_idea" && !value.startup_idea) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startup_idea"],
        message: "Startup idea details are required for startup idea posts.",
      });
    }

    if (value.post_type !== "startup_idea" && value.startup_idea) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startup_idea"],
        message:
          "Startup idea details can only be sent for startup idea posts.",
      });
    }
  });

export const VotePostSchema = z
  .object({
    value: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    direction: z.union([z.literal(-1), z.literal(1)]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.direction === undefined && value.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message: "Either direction or value is required.",
      });
    }
  });

export const SavePostSchema = z
  .object({
    saved: z.boolean(),
  })
  .strict();

export const CreateIdeaRevisionSchema = z
  .object({
    title: z.string().min(10).max(300),
    body_md: z.string().min(1).max(20000).optional(),
    startup_idea: StartupIdeaSchema,
    change_summary: z.string().min(10).max(280),
  })
  .strict();

export const FollowIdeaSchema = z
  .object({
    following: z.boolean(),
  })
  .strict();
