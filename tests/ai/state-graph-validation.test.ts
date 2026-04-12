import { describe, expect, it } from 'vitest';
import { END, StateGraph } from '@/lib/ai/graphs/state-graph';

interface SampleState {
  value: number;
  status: 'ok' | 'bad';
}

describe('state graph validation', () => {
  it('fails when node patch violates compile-time state validator', async () => {
    const graph = new StateGraph<SampleState, Record<string, never>>();

    graph.addNode('start', () => ({
      patch: {
        value: Number.NaN,
      },
      next: END,
    }));

    const compiled = graph.compile({
      startNode: 'start',
      validateState: (state) => {
        const errors: string[] = [];
        if (!Number.isFinite(state.value)) {
          errors.push('value must be finite');
        }
        return errors;
      },
    });

    await expect(
      compiled.invoke({ value: 1, status: 'ok' }, {}),
    ).rejects.toThrow(/validation failed/i);
  });

  it('continues when state validator passes all transitions', async () => {
    const graph = new StateGraph<SampleState, Record<string, never>>();

    graph.addNode('start', () => ({
      patch: {
        value: 2,
      },
      next: END,
    }));

    const compiled = graph.compile({
      startNode: 'start',
      validateState: (state) => (state.value > 0 ? [] : ['value must be positive']),
    });

    const result = await compiled.invoke({ value: 1, status: 'ok' }, {});

    expect(result.value).toBe(2);
  });
});
