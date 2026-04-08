import { ZodError } from 'zod';
import { AI_FEATURE_TO_SUBJECT, type AiFeature } from '@/lib/ai/contracts';
import { isAiFeatureEnabled } from '@/lib/ai/config';
import { getAiRunExecutor } from '@/lib/ai/executor';
import { buildRunIdentity, hashAiInput } from '@/lib/ai/hash';
import { createOrReuseAiRun, listAiRunsByRequester } from '@/lib/ai/runs-repo';
import { fail, handleApiError, ok } from '@/lib/api';
import { enforceRateLimit, rateLimits } from '@/lib/rate-limit';
import { CreateAiRunSchema } from '@/lib/schemas/ai';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireModeratorAccess } from '@/lib/supabase/moderation';

type RateLimitKey = keyof typeof rateLimits;

const FEATURE_RATE_LIMIT_KEYS: Record<AiFeature, RateLimitKey> = {
  founder_idea_feedback: 'ai_founder_feedback',
  career_copilot: 'ai_career_copilot',
  moderation_review: 'ai_moderation_review',
};

async function ensureSubjectAccess(args: {
  userId: string;
  feature: AiFeature;
  subjectId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}) {
  const expectedSubject = AI_FEATURE_TO_SUBJECT[args.feature];

  if (expectedSubject === 'startup_idea') {
    const postResult = await args.supabase
      .from('posts')
      .select('id, author_id, post_type')
      .eq('id', args.subjectId)
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data || postResult.data.post_type !== 'startup_idea') {
      return fail('NOT_FOUND', 'Startup idea not found.', 404);
    }

    if (postResult.data.author_id !== args.userId) {
      return fail('FORBIDDEN', 'Only the founder can request AI feedback for this idea.', 403);
    }

    return null;
  }

  if (expectedSubject === 'resume') {
    const resumeResult = await args.supabase
      .from('resumes')
      .select('id, user_id')
      .eq('id', args.subjectId)
      .maybeSingle();

    if (resumeResult.error) {
      throw new Error(resumeResult.error.message);
    }

    if (!resumeResult.data) {
      return fail('NOT_FOUND', 'Resume not found.', 404);
    }

    if (resumeResult.data.user_id !== args.userId) {
      return fail('FORBIDDEN', 'You do not have access to this resume.', 403);
    }

    return null;
  }

  await requireModeratorAccess();
  const reportResult = await args.supabase
    .from('reports')
    .select('id')
    .eq('id', args.subjectId)
    .maybeSingle();

  if (reportResult.error) {
    throw new Error(reportResult.error.message);
  }

  if (!reportResult.data) {
    return fail('NOT_FOUND', 'Report not found.', 404);
  }

  return null;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const runs = await listAiRunsByRequester(supabase, user.id, 50);

    return ok({ runs });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = CreateAiRunSchema.parse((await request.json()) as unknown);

    if (AI_FEATURE_TO_SUBJECT[body.feature] !== body.subjectType) {
      return fail(
        'AI_SUBJECT_MISMATCH',
        `Feature ${body.feature} requires subject type ${AI_FEATURE_TO_SUBJECT[body.feature]}.`,
        400,
      );
    }

    if (!isAiFeatureEnabled(body.feature)) {
      return fail('AI_FEATURE_DISABLED', 'This AI feature is currently disabled.', 503, {
        feature: body.feature,
      });
    }

    const limit = await enforceRateLimit(FEATURE_RATE_LIMIT_KEYS[body.feature], user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many AI requests. Try again shortly.', 429, {
        feature: body.feature,
      });
    }

    const accessFailure = await ensureSubjectAccess({
      userId: user.id,
      feature: body.feature,
      subjectId: body.subjectId,
      supabase,
    });

    if (accessFailure) {
      return accessFailure;
    }

    const promptKey = body.promptKey ?? `${body.feature}:${body.promptVersion}`;
    const inputHash = hashAiInput(
      body.idempotencyPayload ?? {
        feature: body.feature,
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        metadata: body.metadata ?? {},
      },
    );
    const runIdentity = buildRunIdentity({
      feature: body.feature,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      promptVersion: body.promptVersion,
      promptKey,
      inputHash,
    });

    const { run, reused } = await createOrReuseAiRun(supabase, {
      feature: body.feature,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      requestedBy: user.id,
      promptVersion: body.promptVersion,
      promptKey,
      inputHash,
      runIdentity,
      forceRegenerate: body.forceRegenerate,
      maxAttempts: body.maxAttempts,
      traceId: body.traceId,
      requestId: body.requestId,
      metadata: body.metadata,
    });

    if (!reused) {
      const executor = getAiRunExecutor();
      await executor.enqueue({
        runId: run.id,
        feature: run.feature,
        requestedBy: user.id,
        subjectType: run.subjectType,
        subjectId: run.subjectId,
      });
    }

    return ok({ run, reused });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    return handleApiError(error);
  }
}
