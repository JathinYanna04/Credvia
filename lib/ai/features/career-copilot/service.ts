import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePromptVersion } from '@/lib/ai/config';
import { AiRuntimeError } from '@/lib/ai/errors';
import { buildRunIdentity, hashAiInput } from '@/lib/ai/hash';
import {
  buildCareerCopilotContext,
} from '@/lib/ai/features/career-copilot/context';
import {
  buildCareerCopilotSystemPrompt,
  buildCareerCopilotUserPrompt,
  CAREER_RESPONSE_FORMAT_INSTRUCTIONS,
} from '@/lib/ai/features/career-copilot/prompt';
import {
  CareerCopilotModeSchema,
  CareerCopilotOutputSchemaByMode,
  type CareerCopilotMode,
  type CareerCopilotOutputByMode,
} from '@/lib/ai/features/career-copilot/schema';
import {
  createOrReuseAiRun,
  getAiRunById,
  toAiRunSummary,
  type CreateOrReuseAiRunResult,
} from '@/lib/ai/runs-repo';
import { runStructuredOutput } from '@/lib/ai/structured-runner';
import type { Database } from '@/lib/supabase/types';
import type { AiRunSummary } from '@/lib/types';

type CareerInsightRow = Database['public']['Tables']['career_copilot_insights']['Row'];

interface ResolvedSession {
  id: string;
  userId: string;
}

function toRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toCareerInsightPayload(row: CareerInsightRow) {
  const metadata = toRecord(row.metadata);

  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id,
    mode: row.insight_type,
    headline: row.headline,
    summary: row.summary,
    strengths: toStringArray(row.strengths),
    gaps: toStringArray(row.gaps),
    nextSteps: toStringArray(row.next_steps),
    suggestedRoles: toStringArray(row.suggested_roles),
    output: metadata.output ?? null,
    version: {
      promptVersion: typeof metadata.promptVersion === 'string' ? metadata.promptVersion : null,
      promptKey: typeof metadata.promptKey === 'string' ? metadata.promptKey : null,
      inputHash: typeof metadata.inputHash === 'string' ? metadata.inputHash : null,
    },
    createdAt: row.created_at,
  };
}

async function resolveSession(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  resumeId: string;
  matchId: string | null;
  mode: CareerCopilotMode;
  sessionId?: string;
}): Promise<ResolvedSession> {
  if (args.sessionId) {
    const existing = await args.supabase
      .from('career_copilot_sessions')
      .select('id, user_id')
      .eq('id', args.sessionId)
      .eq('user_id', args.userId)
      .maybeSingle();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    if (!existing.data) {
      throw new AiRuntimeError('NOT_FOUND', 'Career Copilot session not found.', 404);
    }

    return {
      id: existing.data.id,
      userId: existing.data.user_id,
    };
  }

  const created = await args.supabase
    .from('career_copilot_sessions')
    .insert({
      user_id: args.userId,
      resume_id: args.resumeId,
      match_id: args.matchId,
      title: `Career Copilot: ${args.mode.replaceAll('_', ' ')}`,
      metadata: {
        mode: args.mode,
      },
    })
    .select('id, user_id')
    .single();

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? 'Failed to create Career Copilot session.');
  }

  return {
    id: created.data.id,
    userId: created.data.user_id,
  };
}

export async function queueCareerCopilotRun(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  mode: CareerCopilotMode;
  resumeId?: string;
  matchId?: string;
  sessionId?: string;
  regenerate?: boolean;
  traceId?: string;
}): Promise<CreateOrReuseAiRunResult & { sessionId: string; mode: CareerCopilotMode }> {
  const context = await buildCareerCopilotContext({
    supabase: args.supabase,
    userId: args.userId,
    mode: args.mode,
    resumeId: args.resumeId,
    matchId: args.matchId,
  });

  const session = await resolveSession({
    supabase: args.supabase,
    userId: args.userId,
    resumeId: context.resumeId,
    matchId: context.matchId,
    mode: args.mode,
    sessionId: args.sessionId,
  });

  const promptVersion = resolvePromptVersion('career_copilot');
  const promptKey = `career-copilot:${args.mode}`;
  const inputHash = hashAiInput({
    mode: args.mode,
    sessionId: session.id,
    contextSnapshot: {
      resumeId: context.resumeId,
      resumeUpdatedAt: context.resumeUpdatedAt,
      profileUpdatedAt: context.profileUpdatedAt,
      matchId: context.matchId,
      matchUpdatedAt: context.matchUpdatedAt,
    },
    promptVersion,
  });

  const runIdentity = buildRunIdentity({
    feature: 'career_copilot',
    subjectType: 'resume',
    subjectId: context.resumeId,
    promptVersion,
    promptKey,
    inputHash,
  });

  const result = await createOrReuseAiRun(args.supabase, {
    feature: 'career_copilot',
    subjectType: 'resume',
    subjectId: context.resumeId,
    requestedBy: args.userId,
    promptVersion,
    promptKey,
    inputHash,
    runIdentity,
    forceRegenerate: args.regenerate,
    traceId: args.traceId,
    metadata: {
      mode: args.mode,
      sessionId: session.id,
      matchId: context.matchId,
      contextSnapshot: {
        resumeUpdatedAt: context.resumeUpdatedAt,
        profileUpdatedAt: context.profileUpdatedAt,
        matchUpdatedAt: context.matchUpdatedAt,
      },
    },
  });

  return {
    ...result,
    sessionId: session.id,
    mode: args.mode,
  };
}

function buildCareerOutputMapping(
  mode: CareerCopilotMode,
  output: CareerCopilotOutputByMode[CareerCopilotMode],
) {
  if (mode === 'fit_explanation') {
    const typed = output as CareerCopilotOutputByMode['fit_explanation'];

    return {
      headline: typed.headline,
      summary: typed.summary,
      strengths: typed.strengths,
      gaps: typed.concerns,
      nextSteps: typed.concerns,
      suggestedRoles: typed.suggestedRoles,
    };
  }

  if (mode === 'gap_analysis') {
    const typed = output as CareerCopilotOutputByMode['gap_analysis'];

    return {
      headline: typed.headline,
      summary: typed.summary,
      strengths: typed.strengths,
      gaps: typed.gaps,
      nextSteps: typed.actionSteps,
      suggestedRoles: [] as string[],
    };
  }

  if (mode === 'action_plan') {
    const typed = output as CareerCopilotOutputByMode['action_plan'];

    return {
      headline: typed.headline,
      summary: typed.summary,
      strengths: [] as string[],
      gaps: typed.risks,
      nextSteps: [...typed.milestones, ...typed.nextWeekActions],
      suggestedRoles: [] as string[],
    };
  }

  const typed = output as CareerCopilotOutputByMode['interview_questions'];

  return {
    headline: typed.headline,
    summary: typed.summary,
    strengths: [] as string[],
    gaps: [] as string[],
    nextSteps: [...typed.technicalQuestions, ...typed.behavioralQuestions, ...typed.prepTips],
    suggestedRoles: [] as string[],
  };
}

function parseModeFromRun(run: AiRunSummary): CareerCopilotMode {
  const mode = typeof run.metadata?.mode === 'string' ? run.metadata.mode : null;
  const parsed = CareerCopilotModeSchema.safeParse(mode);

  if (!parsed.success) {
    throw new AiRuntimeError('VALIDATION_ERROR', 'Career run metadata is missing mode.', 400, {
      runId: run.id,
    });
  }

  return parsed.data;
}

function parseSessionIdFromRun(run: AiRunSummary): string {
  const sessionId = typeof run.metadata?.sessionId === 'string' ? run.metadata.sessionId : null;

  if (!sessionId) {
    throw new AiRuntimeError('VALIDATION_ERROR', 'Career run metadata is missing sessionId.', 400, {
      runId: run.id,
    });
  }

  return sessionId;
}

export async function processCareerCopilotRun(args: {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
}) {
  if (args.run.feature !== 'career_copilot') {
    throw new AiRuntimeError('AI_FEATURE_UNSUPPORTED', 'Run is not a career copilot run.', 400);
  }

  if (args.run.subjectType !== 'resume') {
    throw new AiRuntimeError('AI_SUBJECT_MISMATCH', 'Career Copilot requires resume subject.', 400);
  }

  if (!args.run.requestedBy) {
    throw new AiRuntimeError('VALIDATION_ERROR', 'Career run is missing requester id.', 400);
  }

  const mode = parseModeFromRun(args.run);
  const sessionId = parseSessionIdFromRun(args.run);
  const matchId = typeof args.run.metadata?.matchId === 'string' ? args.run.metadata.matchId : undefined;

  const context = await buildCareerCopilotContext({
    supabase: args.supabase,
    userId: args.run.requestedBy,
    mode,
    resumeId: args.run.subjectId,
    matchId,
  });

  const schema = CareerCopilotOutputSchemaByMode[mode];
  const structured = await runStructuredOutput({
    schema,
    systemPrompt: buildCareerCopilotSystemPrompt({
      mode,
      promptVersion: args.run.promptVersion,
    }),
    userPrompt: buildCareerCopilotUserPrompt(context),
    responseFormatInstructions: CAREER_RESPONSE_FORMAT_INSTRUCTIONS[mode],
    maxRepairAttempts: 1,
    traceId: args.run.traceId ?? undefined,
  });

  const mapped = buildCareerOutputMapping(mode, structured.data as CareerCopilotOutputByMode[CareerCopilotMode]);

  const insightInsert = await args.supabase
    .from('career_copilot_insights')
    .upsert(
      {
        session_id: sessionId,
        run_id: args.run.id,
        user_id: args.run.requestedBy,
        insight_type: mode,
        headline: mapped.headline,
        summary: mapped.summary,
        strengths: mapped.strengths,
        gaps: mapped.gaps,
        next_steps: mapped.nextSteps,
        suggested_roles: mapped.suggestedRoles,
        metadata: {
          output: structured.data,
          mode,
          promptVersion: args.run.promptVersion,
          promptKey: args.run.promptKey ?? null,
          inputHash: args.run.inputHash ?? null,
          repairCount: structured.repairCount,
          traceId: args.run.traceId ?? null,
          modelVersion: structured.modelVersion,
          providerRequestId: structured.requestId,
        },
      },
      {
        onConflict: 'run_id',
      },
    )
    .select('id')
    .single();

  if (insightInsert.error) {
    throw new Error(insightInsert.error.message);
  }

  const sessionUpdate = await args.supabase
    .from('career_copilot_sessions')
    .update({
      run_id: args.run.id,
      title: mapped.headline,
      metadata: {
        mode,
        lastInsightId: insightInsert.data?.id ?? null,
      },
    })
    .eq('id', sessionId)
    .eq('user_id', args.run.requestedBy);

  if (sessionUpdate.error) {
    throw new Error(sessionUpdate.error.message);
  }

  return {
    provider: structured.provider,
    model: structured.model,
    modelVersion: structured.modelVersion,
    latencyMs: structured.latencyMs,
    providerMetadata: structured.providerMetadata,
  };
}

export async function getCareerCopilotState(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  sessionId?: string;
}) {
  if (args.sessionId) {
    const [sessionResult, insightsResult] = await Promise.all([
      args.supabase
        .from('career_copilot_sessions')
        .select('*')
        .eq('id', args.sessionId)
        .eq('user_id', args.userId)
        .maybeSingle(),
      args.supabase
        .from('career_copilot_insights')
        .select('*')
        .eq('session_id', args.sessionId)
        .eq('user_id', args.userId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (sessionResult.error) {
      throw new Error(sessionResult.error.message);
    }

    if (insightsResult.error) {
      throw new Error(insightsResult.error.message);
    }

    if (!sessionResult.data) {
      throw new AiRuntimeError('NOT_FOUND', 'Career Copilot session not found.', 404);
    }

    const latestRun = sessionResult.data.run_id
      ? await getAiRunById(args.supabase, sessionResult.data.run_id)
      : null;

    return {
      session: sessionResult.data,
      latestRun,
      insights: (insightsResult.data ?? []).map(toCareerInsightPayload),
    };
  }

  const [sessionsResult, insightsResult] = await Promise.all([
    args.supabase
      .from('career_copilot_sessions')
      .select('*')
      .eq('user_id', args.userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    args.supabase
      .from('career_copilot_insights')
      .select('*')
      .eq('user_id', args.userId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }

  if (insightsResult.error) {
    throw new Error(insightsResult.error.message);
  }

  const sessionIds = (sessionsResult.data ?? []).map((session) => session.id);
  const latestRunsResult = sessionIds.length > 0
    ? await args.supabase
        .from('ai_runs')
        .select('*')
        .eq('feature', 'career_copilot')
        .eq('requested_by', args.userId)
        .in('subject_id', (sessionsResult.data ?? []).map((session) => session.resume_id ?? '').filter(Boolean))
        .order('created_at', { ascending: false })
        .limit(60)
    : { data: [], error: null };

  if (latestRunsResult.error) {
    throw new Error(latestRunsResult.error.message);
  }

  return {
    sessions: sessionsResult.data ?? [],
    insights: (insightsResult.data ?? []).map(toCareerInsightPayload),
    latestRuns: (latestRunsResult.data ?? []).map((row) => toAiRunSummary(row)),
  };
}
