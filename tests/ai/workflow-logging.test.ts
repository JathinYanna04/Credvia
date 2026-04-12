import { describe, expect, it } from 'vitest';
import { truncateForLog } from '@/lib/ai/logging/workflow';

describe('workflow logging helpers', () => {
  it('returns source value unchanged when below max length', () => {
    const result = truncateForLog('credvia', 20);
    expect(result).toBe('credvia');
  });

  it('truncates long values with explicit omitted length marker', () => {
    const value = 'a'.repeat(120);
    const result = truncateForLog(value, 40);

    expect(result.startsWith('a'.repeat(40))).toBe(true);
    expect(result).toContain('<truncated:80>');
  });
});
