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

    await expect(
      runStructuredOutput({
        schema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Output name.',
        responseFormatInstructions: 'Use key name string.',
        traceId: 'trace-fail',
      }),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_REPAIR_FAILED',
    });

    expect(invokeProviderForStructuredOutput).toHaveBeenCalledTimes(2);
  });
});
