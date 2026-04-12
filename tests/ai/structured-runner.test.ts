import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const invokeProviderForStructuredOutput = vi.fn();

vi.mock('@/lib/ai/provider-adapter', () => ({
  invokeProviderForStructuredOutput,
}));

describe('structured runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses JSON wrapped in markdown fences and surrounding text', async () => {
    invokeProviderForStructuredOutput.mockResolvedValueOnce({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      outputText: 'Here is the result:\n```json\n{"name":"Credvia"}\n```\nDone.',
      requestId: 'req_wrapped',
      latencyMs: 35,
      providerMetadata: {},
    });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    const result = await runStructuredOutput({
      schema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Output name.',
      responseFormatInstructions: 'Use key name string.',
      traceId: 'trace-wrapped',
    });

    expect(result.data).toEqual({ name: 'Credvia' });
    expect(result.repairCount).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.qualitySignal.providerAttemptCount).toBe(1);
    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it('repairs malformed output and returns parsed data', async () => {
    invokeProviderForStructuredOutput
      .mockResolvedValueOnce({
        provider: 'openai',
        model: 'gpt-test',
        modelVersion: 'gpt-test-1',
        outputText: '{"name":123}',
        requestId: 'req_bad',
        latencyMs: 50,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'openai',
        model: 'gpt-test',
        modelVersion: 'gpt-test-1',
        outputText: '{"name":"Credvia"}',
        requestId: 'req_ok',
        latencyMs: 60,
        providerMetadata: {},
      });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    const result = await runStructuredOutput({
      schema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Output name.',
      responseFormatInstructions: 'Use key name string.',
      maxRepairAttempts: 1,
      traceId: 'trace-1',
    });

    expect(result.data).toEqual({ name: 'Credvia' });
    expect(result.repairCount).toBe(1);
    expect(result.requestId).toBe('req_ok');
    expect(result.latencyMs).toBe(110);
    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it('fails with typed error after one repair retry', async () => {
    invokeProviderForStructuredOutput
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":123}',
        requestId: 'req_bad_1',
        latencyMs: 40,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":456}',
        requestId: 'req_bad_2',
        latencyMs: 50,
        providerMetadata: {},
      });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    let thrown: unknown;
    try {
      await runStructuredOutput({
        schema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Output name.',
        responseFormatInstructions: 'Use key name string.',
        traceId: 'trace-fail',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'AI_OUTPUT_REPAIR_FAILED',
      details: expect.objectContaining({
        provider: 'groq',
        model: 'llama-3.3-70b',
        requestId: 'req_bad_2',
        validationFailureCount: 2,
        repairCount: 1,
      }),
    });

    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it('normalizes output prefix and trailing commas before parsing', async () => {
    invokeProviderForStructuredOutput.mockResolvedValueOnce({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      outputText: 'output: {"name":"Credvia",}',
      requestId: 'req_prefix',
      latencyMs: 29,
      providerMetadata: {},
    });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    const result = await runStructuredOutput({
      schema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Output name.',
      responseFormatInstructions: 'Use key name string.',
      traceId: 'trace-prefix-normalization',
    });

    expect(result.data).toEqual({ name: 'Credvia' });
    expect(result.repairCount).toBe(0);
  });

  it('honors bounded repair attempts up to three total retries', async () => {
    invokeProviderForStructuredOutput
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":123}',
        requestId: 'req_1',
        latencyMs: 40,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":456}',
        requestId: 'req_2',
        latencyMs: 41,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":789}',
        requestId: 'req_3',
        latencyMs: 42,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"name":"Credvia"}',
        requestId: 'req_4',
        latencyMs: 43,
        providerMetadata: {},
      });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    const result = await runStructuredOutput({
      schema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Output name.',
      responseFormatInstructions: 'Use key name string.',
      maxRepairAttempts: 3,
      traceId: 'trace-max-repair',
    });

    expect(result.data).toEqual({ name: 'Credvia' });
    expect(result.repairCount).toBe(3);
    expect(result.confidence).toBeLessThan(0.8);
    expect(result.qualitySignal.repairCount).toBe(3);
    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(4);
  });

  it('recovers from partial JSON and trailing noise without needing repair retry', async () => {
    invokeProviderForStructuredOutput
      .mockResolvedValueOnce({
        provider: 'openai',
        model: 'gpt-test',
        modelVersion: 'gpt-test-1',
        outputText: '{"name":"Credvia"',
        requestId: 'req_partial_1',
        latencyMs: 30,
        providerMetadata: {},
      });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({ name: z.string() });

    const result = await runStructuredOutput({
      schema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Output name.',
      responseFormatInstructions: 'Use key name string.',
      maxRepairAttempts: 2,
      traceId: 'trace-partial-json',
    });

    expect(result.data).toEqual({ name: 'Credvia' });
    expect(result.repairCount).toBe(0);
    expect(result.qualitySignal.parseFailureCount).toBe(0);
    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it('fails on hallucinated nested schema fields after retries', async () => {
    invokeProviderForStructuredOutput
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"items":[{"title":"Ok","score":"high"}],"unexpected":true}',
        requestId: 'req_halluc_1',
        latencyMs: 30,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        outputText: '{"items":[{"title":123,"score":-1}],"extra":{"foo":"bar"}}',
        requestId: 'req_halluc_2',
        latencyMs: 31,
        providerMetadata: {},
      });

    const { runStructuredOutput } = await import('@/lib/ai/structured-runner');
    const schema = z.object({
      items: z.array(z.object({
        title: z.string(),
        score: z.number().min(0).max(1),
      })),
    });

    await expect(
      runStructuredOutput({
        schema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Return ranked items.',
        responseFormatInstructions: 'Strict schema only.',
        maxRepairAttempts: 1,
        traceId: 'trace-hallucinated-fields',
      }),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_REPAIR_FAILED',
    });

    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(2);
  });
});
