import type { SupabaseClient } from '@supabase/supabase-js';
import { END, StateGraph, type GraphNodeHandler } from '@/lib/ai/graphs/state-graph';
import { logWorkflowEvent, truncateForLog, type WorkflowLogContext } from '@/lib/ai/logging/workflow';
import { AiRuntimeError, isAiRuntimeError, type AiRuntimeErrorCode } from '@/lib/ai/errors';
import { processCareerCopilotRun } from '@/lib/ai/features/career-copilot/service';
import { processFounderIdeaFeedbackRun } from '@/lib/ai/features/founder-feedback/service';
import { processModerationReviewRun } from '@/lib/ai/features/moderation-review/service';
import type { Database } from '@/lib/supabase/types';
import type { AiFeature, AiRunSummary } from '@/lib/types';
import type { ProcessAiRunInput, ProcessAiRunResult } from '@/lib/ai/runtime/process-types';

type WorkflowStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface ProcessAiRunWorkflowState {
  runId: string;
  entityId: string;
  workflowType: AiFeature;
  input: AiRunSummary;
  normalizedInput: Record<string, unknown>;
  context: Record<string, unknown> | null;
  steps: string[];
  intermediateOutputs: Record<string, unknown>;
  finalOutput: ProcessAiRunResult | null;
  status: WorkflowStatus;
  failureCode: string | null;
  failureMessage: string | null;
  traceId: string;
  startedAt: string;
  completedAt: string | null;
  retryCount: number;
  nodeTimingsMs: Record<string, number>;
  stateTransitions: Array<{
    node: string;
    fromStatus: WorkflowStatus;
    toStatus: WorkflowStatus;
    durationMs: number;
  }>;
}

interface WorkflowContext {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
  handlers: Record<AiFeature, (input: ProcessAiRunInput) => Promise<ProcessAiRunResult>>;
  workflowLogContext: WorkflowLogContext;
  capturedError: unknown;
}

const FEATURE_HANDLERS: Record<AiFeature, (input: ProcessAiRunInput) => Promise<ProcessAiRunResult>> = {
  founder_idea_feedback: processFounderIdeaFeedbackRun,
  career_copilot: processCareerCopilotRun,
  moderation_review: processModerationReviewRun,
};

function summarizeStateForLog(state: ProcessAiRunWorkflowState) {
  const summary = {
    status: state.status,
    failureCode: state.failureCode,
    failureMessage: state.failureMessage,
    stepCount: state.steps.length,
    hasContext: Boolean(state.context),
    hasFinalOutput: Boolean(state.finalOutput),
    retryCount: state.retryCount,
    inputHash: state.input.inputHash ?? null,
  };

  return truncateForLog(JSON.stringify(summary), 1200);
}

function validateWorkflowState(state: ProcessAiRunWorkflowState) {
  const errors: string[] = [];

  if (!state.runId || state.runId.trim().length === 0) {
    errors.push('runId is required');
  }

  if (!state.entityId || state.entityId.trim().length === 0) {
    errors.push('entityId is required');
  }

  if (!state.workflowType || state.workflowType.trim().length === 0) {
    errors.push('workflowType is required');
  }

  if (!['queued', 'running', 'succeeded', 'failed'].includes(state.status)) {
    errors.push('status is invalid');
  }

  if (!Array.isArray(state.steps)) {
    errors.push('steps must be an array');
  }

  if (!state.input || !state.input.id) {
    errors.push('input run payload is missing');
  }

  if (!state.traceId || state.traceId.trim().length === 0) {
    errors.push('traceId is required');
  }

  return errors;
}

function toFailureCode(error: unknown) {
  if (isAiRuntimeError(error)) {
    return error.code;
  }

  return 'INTERNAL_ERROR';
}

function toFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return truncateForLog(error.message, 500);
  }

  return 'Unhandled workflow failure.';
}

function toRuntimeErrorCode(code: string | null): AiRuntimeErrorCode {
  const knownCodes: AiRuntimeErrorCode[] = [
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'AI_FEATURE_UNSUPPORTED',
    'AI_FEATURE_DISABLED',
    'AI_SUBJECT_MISMATCH',
    'AI_PROVIDER_NOT_CONFIGURED',
    'AI_PROVIDER_UNAVAILABLE',
    'AI_EXECUTOR_UNAVAILABLE',
    'AI_OUTPUT_INVALID',
    'AI_OUTPUT_REPAIR_FAILED',
    'AI_RUN_STATE_INVALID',
    'AI_RUN_CLAIM_CONFLICT',
    'AI_RUN_DUPLICATE',
    'AI_RUN_NOT_READY',
    'ANALYSIS_SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
  ];

  if (code && knownCodes.includes(code as AiRuntimeErrorCode)) {
    return code as AiRuntimeErrorCode;
  }

  return 'INTERNAL_ERROR';
}

function withNodeTracing(
  name: string,
  node: GraphNodeHandler<ProcessAiRunWorkflowState, WorkflowContext>,
): GraphNodeHandler<ProcessAiRunWorkflowState, WorkflowContext> {
  return async (state, context) => {
    const startedAt = Date.now();
    const statusBefore = state.status;
    const stateBefore = summarizeStateForLog(state);
    state.steps.push(name);

    logWorkflowEvent('info', 'ai-workflow-node', 'Workflow node started', context.workflowLogContext, {
      node: name,
      status: state.status,
      retryCount: state.retryCount,
      stateBefore,
    });

    try {
      const result = (await node(state, context)) ?? {};
      const durationMs = Date.now() - startedAt;
      const statusAfter = state.status;
      state.nodeTimingsMs[name] = durationMs;
      state.stateTransitions.push({
        node: name,
        fromStatus: statusBefore,
        toStatus: statusAfter,
        durationMs,
      });

      const patchPreview = result.patch
        ? truncateForLog(JSON.stringify(result.patch), 1200)
        : null;

      logWorkflowEvent('info', 'ai-workflow-node', 'Workflow node completed', context.workflowLogContext, {
        node: name,
        durationMs,
        status: state.status,
        statusBefore,
        statusAfter,
        next: result.next ?? null,
        patchPreview,
        stateAfter: summarizeStateForLog(state),
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      context.capturedError = error;
      state.failureCode = toFailureCode(error);
      state.failureMessage = toFailureMessage(error);
      state.status = 'failed';
      state.nodeTimingsMs[name] = durationMs;
      state.stateTransitions.push({
        node: name,
        fromStatus: statusBefore,
        toStatus: state.status,
        durationMs,
      });

      logWorkflowEvent('error', 'ai-workflow-node', 'Workflow node failed', context.workflowLogContext, {
        node: name,
        durationMs,
        failureCode: state.failureCode,
        failureMessage: state.failureMessage,
        stateBefore,
        stateAfter: summarizeStateForLog(state),
      });

      return {
        next: 'markFailed',
      };
    }
  };
}

function createProcessAiRunGraph() {
  const graph = new StateGraph<ProcessAiRunWorkflowState, WorkflowContext>();

  graph.addNode(
    'validateInput',
    withNodeTracing('validateInput', async (state, context) => {
      if (!context.handlers[state.workflowType]) {
        state.failureCode = 'AI_FEATURE_UNSUPPORTED';
        state.failureMessage = `No workflow handler is registered for ${state.workflowType}.`;
      }

      if (!state.runId || !state.entityId) {
        state.failureCode = 'VALIDATION_ERROR';
        state.failureMessage = 'Workflow input is missing run or entity id.';
      }

      state.status = 'running';

      return {
        patch: {
          normalizedInput: {
            runId: state.runId,
            feature: state.workflowType,
            subjectType: state.input.subjectType,
            subjectId: state.entityId,
            promptVersion: state.input.promptVersion,
            promptKey: state.input.promptKey ?? null,
            attemptCount: state.input.attemptCount ?? null,
            maxAttempts: state.input.maxAttempts ?? null,
          },
        },
      };
    }),
  );

  graph.addConditionalEdges('validateInput', (state) => (state.failureCode ? 'failed' : 'ok'), {
    ok: 'chooseStrategy',
    failed: 'markFailed',
  });

  graph.addNode(
    'chooseStrategy',
    withNodeTracing('chooseStrategy', async (state) => {
      const strategy = state.workflowType;

      state.intermediateOutputs.selectedStrategy = strategy;
      state.context = {
        strategy,
      };
    }),
  );

  graph.addEdge('chooseStrategy', 'invokeModel');

  graph.addNode(
    'invokeModel',
    withNodeTracing('invokeModel', async (state, context) => {
      const handler = context.handlers[state.workflowType];

      if (!handler) {
        state.failureCode = 'AI_FEATURE_UNSUPPORTED';
        state.failureMessage = `No workflow handler is registered for ${state.workflowType}.`;
        return {
          next: 'markFailed',
        };
      }

      try {
        const output = await handler({
          supabase: context.supabase,
          run: context.run,
        });

        state.finalOutput = output;
        state.intermediateOutputs.invokeModel = {
          provider: output.provider ?? null,
          model: output.model ?? null,
          modelVersion: output.modelVersion ?? null,
          latencyMs: output.latencyMs ?? null,
        };

        return {
          next: 'persistResult',
        };
      } catch (error) {
        context.capturedError = error;
        state.failureCode = toFailureCode(error);
        state.failureMessage = toFailureMessage(error);
        return {
          next: 'markFailed',
        };
      }
    }),
  );

  graph.addNode(
    'persistResult',
    withNodeTracing('persistResult', async (state) => {
      if (!state.finalOutput) {
        state.failureCode = 'AI_OUTPUT_INVALID';
        state.failureMessage = 'Workflow completed without a final output payload.';
        return {
          next: 'markFailed',
        };
      }

      state.intermediateOutputs.persistResult = {
        persisted: true,
      };

      return {};
    }),
  );

  graph.addEdge('persistResult', 'markSucceeded');

  graph.addNode(
    'markSucceeded',
    withNodeTracing('markSucceeded', async (state) => {
      state.status = 'succeeded';
      state.completedAt = new Date().toISOString();

      return {
        next: END,
      };
    }),
  );

  graph.addNode(
    'markFailed',
    withNodeTracing('markFailed', async (state) => {
      state.status = 'failed';
      state.completedAt = new Date().toISOString();

      return {
        next: END,
      };
    }),
  );

  return graph.compile({
    startNode: 'validateInput',
    maxSteps: 20,
    validateState: validateWorkflowState,
  });
}

const compiledProcessAiRunGraph = createProcessAiRunGraph();

export async function executeProcessAiRunWorkflow(
  input: ProcessAiRunInput,
): Promise<ProcessAiRunResult> {
  const workflowLogContext: WorkflowLogContext = {
    traceId: input.run.traceId ?? `run-${input.run.id}`,
    runId: input.run.id,
    workflowType: input.run.feature,
    entityId: input.run.subjectId,
  };

  const initialState: ProcessAiRunWorkflowState = {
    runId: input.run.id,
    entityId: input.run.subjectId,
    workflowType: input.run.feature,
    input: input.run,
    normalizedInput: {},
    context: null,
    steps: [],
    intermediateOutputs: {},
    finalOutput: null,
    status: 'queued',
    failureCode: null,
    failureMessage: null,
    traceId: workflowLogContext.traceId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    retryCount: Math.max(0, (input.run.attemptCount ?? 1) - 1),
    nodeTimingsMs: {},
    stateTransitions: [],
  };

  const context: WorkflowContext = {
    supabase: input.supabase,
    run: input.run,
    handlers: FEATURE_HANDLERS,
    workflowLogContext,
    capturedError: null,
  };

  logWorkflowEvent('info', 'ai-workflow', 'AI workflow execution started', workflowLogContext, {
    status: initialState.status,
    attemptCount: input.run.attemptCount ?? null,
    maxAttempts: input.run.maxAttempts ?? null,
    promptVersion: input.run.promptVersion,
    promptKey: input.run.promptKey ?? null,
    inputHash: input.run.inputHash ?? null,
    runIdentity: input.run.runIdentity ?? null,
  });

  const startedAt = Date.now();
  let finalState: ProcessAiRunWorkflowState;

  try {
    finalState = await compiledProcessAiRunGraph.invoke(initialState, context);
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    logWorkflowEvent('error', 'ai-workflow', 'AI workflow execution crashed', workflowLogContext, {
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      inputHash: input.run.inputHash ?? null,
      runIdentity: input.run.runIdentity ?? null,
    });

    if (context.capturedError instanceof Error) {
      throw context.capturedError;
    }

    throw new AiRuntimeError(
      'AI_RUN_STATE_INVALID',
      'Workflow state validation failed during execution.',
      500,
      {
        runId: input.run.id,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const durationMs = Date.now() - startedAt;

  if (finalState.status === 'failed') {
    logWorkflowEvent('error', 'ai-workflow', 'AI workflow execution failed', workflowLogContext, {
      durationMs,
      failureCode: finalState.failureCode,
      failureMessage: finalState.failureMessage,
      steps: finalState.steps,
      nodeTimingsMs: finalState.nodeTimingsMs,
      stateTransitions: finalState.stateTransitions,
      inputHash: input.run.inputHash ?? null,
      runIdentity: input.run.runIdentity ?? null,
    });

    if (context.capturedError instanceof Error) {
      throw context.capturedError;
    }

    throw new AiRuntimeError(
      toRuntimeErrorCode(finalState.failureCode),
      finalState.failureMessage ?? 'Workflow execution failed.',
      500,
      {
        failureCode: finalState.failureCode,
        steps: finalState.steps,
      },
    );
  }

  logWorkflowEvent('info', 'ai-workflow', 'AI workflow execution succeeded', workflowLogContext, {
    durationMs,
    steps: finalState.steps,
    nodeTimingsMs: finalState.nodeTimingsMs,
    stateTransitions: finalState.stateTransitions,
    provider: finalState.finalOutput?.provider ?? null,
    model: finalState.finalOutput?.model ?? null,
    retryCount: finalState.retryCount,
    inputHash: input.run.inputHash ?? null,
    runIdentity: input.run.runIdentity ?? null,
    outputQualitySignal: finalState.finalOutput?.qualitySignal ?? null,
  });

  if (!finalState.finalOutput) {
    throw new AiRuntimeError(
      'AI_OUTPUT_INVALID',
      'Workflow finished without a final output payload.',
      500,
      {
        runId: input.run.id,
        steps: finalState.steps,
      },
    );
  }

  return {
    ...finalState.finalOutput,
    providerMetadata: {
      ...(finalState.finalOutput.providerMetadata ?? {}),
      workflowTrace: {
        nodePath: finalState.steps,
        nodeTimingsMs: finalState.nodeTimingsMs,
        stateTransitions: finalState.stateTransitions,
        totalDurationMs: durationMs,
        retryCount: finalState.retryCount,
        inputHash: input.run.inputHash ?? null,
      },
    },
  };
}