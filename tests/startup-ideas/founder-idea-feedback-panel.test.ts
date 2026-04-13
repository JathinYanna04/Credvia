// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FounderIdeaFeedbackPanel } from '@/components/ai/founder/FounderIdeaFeedbackPanel';

(globalThis as { React?: typeof React }).React = React;

type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function response(payload: unknown, status = 200): MockFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function buildRun(status: 'queued' | 'running' | 'succeeded' | 'failed') {
  return {
    id: `run-${status}`,
    feature: 'founder_idea_feedback',
    subjectType: 'startup_idea',
    subjectId: 'idea-1',
    requestedBy: 'founder-1',
    status,
    promptVersion: 'founder-v1',
    createdAt: '2026-04-08T00:00:00.000Z',
    modelVersion: 'llama-3.1-8b-instant',
    errorMessage: status === 'failed' ? 'The latest run failed.' : null,
  };
}

function buildReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    runId: 'run-succeeded',
    postId: 'idea-1',
    founderUserId: 'founder-1',
    verdict: 'needs_work',
    confidence: 0.67,
    summary: 'One-liner: Clear pain signal, but distribution proof and switching evidence are still weak.',
    strengths: [
      'Problem statement is concrete and tied to onboarding failure moments.',
      'Target audience is specific enough to run focused interviews.',
    ],
    risks: [
      'Distribution risk: no repeatable channel is specified.',
      'Adoption risk: additional workflow overhead may reduce activation.',
    ],
    suggestions: [
      'Missing answer: Why will onboarding managers switch from current QA checklists?',
      'Next step experiment: Run 10 founder-led demos and track commitment to a paid pilot.',
      'Next step experiment: Measure false-positive rate on 30 historical onboarding artifacts.',
    ],
    marketSignals: [
      'Teams already spend manual effort on launch QA before go-live.',
    ],
    rewrite: 'Title: Launch Readiness QA Copilot\nBody: AI audits onboarding handoffs, flags launch blockers, and assigns high-risk fixes before customer go-live.',
    reasoning: [
      'The pain is credible, but proof of willingness-to-pay is incomplete.',
      'Differentiation exists but is not yet defended with benchmark data.',
    ],
    evidence: [
      {
        claim: 'Launch QA is currently manual and inconsistent.',
        evidence: 'Idea body describes hidden handoff gaps and reactive support escalations.',
        source: 'idea',
        confidence: 0.9,
      },
      {
        claim: 'No proven channel is stated.',
        evidence: 'No acquisition motion is present in current context.',
        source: 'revision',
        confidence: 0.7,
      },
    ],
    investorPushback: ['Why will teams pay if they can keep using existing playbooks?'],
    bestNextExperiment: 'Pilot with 3 onboarding teams and compare escalations before/after launch.',
    communityRead: 'No strong external validation yet from discussion.',
    moatConcern: 'Model edge may erode without proprietary onboarding outcome data.',
    version: {
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
    },
    createdAt: '2026-04-08T00:02:00.000Z',
    ...overrides,
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  global.fetch = originalFetch;
});

describe('FounderIdeaFeedbackPanel', () => {
  it('logs panel mount diagnostics with debug version marker', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ data: { latestRun: null, review: null, stale: false } }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    await screen.findByRole('button', { name: 'Get AI Feedback' });

    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] panel mounted',
      expect.objectContaining({ version: 'debug-1', ideaId: 'idea-1' }),
    );
  });

  it('clicking Get AI Feedback starts a request', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ data: { latestRun: null, review: null, stale: false } }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({ data: { latestRun: buildRun('queued'), review: null, stale: false } }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const button = await screen.findByRole('button', { name: 'Get AI Feedback' });
    await userEvent.click(button);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/v1/ideas/idea-1/ai-feedback');
      expect(postCall?.[1]?.body).toBe(
        JSON.stringify({ regenerate: false, forceNewRun: false }),
      );
    });

    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] click triggered',
      expect.objectContaining({ ideaId: 'idea-1', regenerate: false }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] click',
      expect.objectContaining({ ideaId: 'idea-1', canRequest: true, disabled: false }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] post triggered',
      expect.objectContaining({
        ideaId: 'idea-1',
        payload: {
          regenerate: false,
          forceNewRun: false,
        },
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] about to POST /ai-feedback',
      expect.objectContaining({
        ideaId: 'idea-1',
        method: 'POST',
        payload: {
          regenerate: false,
          forceNewRun: false,
        },
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[founder-feedback] POST completed',
      expect.objectContaining({ status: 200 }),
    );
  });

  it('click blocked by guard logs explicit reason', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('running'),
          review: null,
          stale: false,
          state: 'processing',
          shouldPoll: true,
          terminal: false,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const button = await screen.findByRole('button', { name: 'Working...' });
  expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);

    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[founder-feedback] aborted before request',
      expect.objectContaining({ reason: 'already_polling', ideaId: 'idea-1' }),
    );
    expect(await screen.findByTestId('founder-feedback-generation-block-reason')).toBeTruthy();
  });

  it('legacy recovered empty state is informational and still allows fresh POST generation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: null,
          review: null,
          stale: false,
          state: 'empty',
          terminal: true,
          shouldPoll: false,
          recoveredFromLegacyOutputFailure: true,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          terminal: false,
          shouldPoll: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('No founder AI review yet')).toBeTruthy();
    expect(screen.queryByTestId('founder-feedback-generation-block-reason')).toBeNull();

    const info = await screen.findByTestId('founder-feedback-generation-info-reason');
    expect(info.textContent).toContain('fresh AI review');

    const buttons = await screen.findAllByRole('button', { name: 'Get AI Feedback' });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute('aria-disabled')).not.toBe('true');
    }
    const firstButton = buttons[0];
    if (!firstButton) {
      throw new Error('Expected at least one Get AI Feedback button.');
    }
    await userEvent.click(firstButton);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/v1/ideas/idea-1/ai-feedback');
    });
  });

  it('does not start polling when shouldPoll is true but no run exists, and still POSTs on click', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: null,
          review: null,
          stale: false,
          state: 'empty',
          terminal: false,
          shouldPoll: true,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          terminal: false,
          shouldPoll: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const button = await screen.findByRole('button', { name: 'Get AI Feedback' });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(button);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/v1/ideas/idea-1/ai-feedback');
    });
  });

  it('shows processing status when run is queued or running', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { latestRun: buildRun('running'), review: null, stale: false } }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('Processing')).toBeTruthy();
    expect(screen.getByText(/AI analysis is running/i)).toBeTruthy();
  });

  it('renders completed review in premium sections', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('succeeded'),
          review: buildReview(),
          stale: false,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
        targetAudience: 'Onboarding leaders at B2B SaaS companies',
        marketCategory: 'SaaS operations',
        stage: 'problem_validation',
      }),
    );

    expect(await screen.findByText('Hero Verdict')).toBeTruthy();
    expect(screen.getByText('Score Breakdown')).toBeTruthy();
    expect(screen.getByText('Missing Answers')).toBeTruthy();
    expect(screen.getByText('Next Steps')).toBeTruthy();
    expect(screen.getByText('Rewrite Block')).toBeTruthy();
    expect(screen.getByText('ICP')).toBeTruthy();
  });

  it('shows failed state with retry affordance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('failed'),
            review: null,
            stale: false,
          },
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByRole('button', { name: 'Retry AI Feedback' })).toBeTruthy();
    expect(screen.getAllByText(/latest run failed/i).length).toBeGreaterThan(0);
  });

  it('forces regenerate=true when retrying from terminal failed state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: {
              ...buildRun('failed'),
              errorCode: 'AI_PROVIDER_NOT_CONFIGURED',
              errorMessage: 'AI review is not configured yet. Groq is selected, but no API key is available to process this request.',
            },
            review: null,
            stale: false,
            state: 'failed',
            terminal: true,
            shouldPoll: false,
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('queued'),
            review: null,
            stale: false,
            state: 'queued',
            terminal: false,
            shouldPoll: true,
          },
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const retryButton = await screen.findByRole('button', { name: 'Retry AI Feedback' });
    await userEvent.click(retryButton);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[1]?.body).toBe(
        JSON.stringify({ regenerate: true, forceNewRun: true }),
      );
    });
  });

  it('renders rate-limited user message and exits loading state', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        data: {
          latestRun: {
            ...buildRun('failed'),
            errorCode: 'RATE_LIMITED',
            errorMessage: 'AI review is temporarily rate-limited. Please retry in a few seconds.',
          },
          review: null,
          stale: false,
        },
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('AI review is temporarily rate-limited. Please retry in a few seconds.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry AI Feedback' })).toBeTruthy();
  });

  it('prefers latest AI_OUTPUT_REPAIR_FAILED message over stale provider 429 copy', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        data: {
          latestRun: {
            ...buildRun('failed'),
            errorCode: 'AI_OUTPUT_REPAIR_FAILED',
            errorMessage: 'Provider groq rejected the request (429).',
            providerMetadata: {
              errorCode: 'RATE_LIMITED',
              validationIssues: ['summary: Required'],
            },
          },
          review: null,
          stale: false,
          state: 'failed',
          shouldPoll: false,
          terminal: true,
        },
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText(/output needed recovery and was returned as partial success/i)).toBeTruthy();
    expect(screen.queryByText(/temporarily rate-limited/i)).toBeNull();
  });

  it('shows partial success banner when best-effort recovery mode is used', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        data: {
          latestRun: {
            ...buildRun('succeeded'),
            providerMetadata: {
              structuredMode: 'best_effort_raw_fallback',
              outputRecovery: 'best_effort_raw_mapping',
            },
          },
          review: buildReview(),
          stale: false,
          state: 'succeeded',
          shouldPoll: false,
          terminal: true,
        },
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText(/partial success: output formatting recovery was applied/i)).toBeTruthy();
  });

  it('renders synthesized partial review payload instead of empty state', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        data: {
          latestRun: {
            ...buildRun('failed'),
            errorCode: 'AI_OUTPUT_REPAIR_FAILED',
          },
          review: buildReview({
            id: 'partial-review-1',
            runId: 'run-failed',
            partial: true,
            partialReason: 'output_recovery',
          }),
          stale: false,
          state: 'partial',
          shouldPoll: false,
          terminal: true,
          recoveredFromLegacyOutputFailure: true,
        },
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText(/AI generated a partial result/i)).toBeTruthy();
    expect(screen.queryByText('No founder AI review yet')).toBeNull();
    expect(screen.getByText('Hero Verdict')).toBeTruthy();
  });

  it('recovered empty state still allows fresh POST generation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: null,
          review: null,
          stale: false,
          state: 'empty',
          terminal: true,
          shouldPoll: false,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          terminal: false,
          shouldPoll: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const button = await screen.findByRole('button', { name: 'Get AI Feedback' });
    await userEvent.click(button);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
    });
  });

  it('partial-success mode still allows regenerate and sends POST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: {
            ...buildRun('succeeded'),
            providerMetadata: {
              structuredMode: 'best_effort_raw_fallback',
              outputRecovery: 'best_effort_raw_mapping',
            },
          },
          review: buildReview(),
          stale: false,
          state: 'succeeded',
          terminal: true,
          shouldPoll: false,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: buildReview(),
          stale: false,
          state: 'queued',
          terminal: false,
          shouldPoll: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText(/partial success: output formatting recovery was applied/i)).toBeTruthy();
    expect(screen.queryByTestId('founder-feedback-generation-block-reason')).toBeNull();

    const regenerateButton = await screen.findByRole('button', { name: 'Regenerate AI Review' });
    expect(regenerateButton.getAttribute('aria-disabled')).not.toBe('true');
    await userEvent.click(regenerateButton);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[1]?.body).toBe(
        JSON.stringify({ regenerate: true, forceNewRun: true }),
      );
    });
  });

  it('does not show contradictory empty-state hard block messaging when requesting is allowed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: null,
          review: null,
          stale: false,
          state: 'empty',
          terminal: true,
          shouldPoll: false,
          recoveredFromLegacyOutputFailure: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('No founder AI review yet')).toBeTruthy();
    expect(screen.queryByTestId('founder-feedback-generation-block-reason')).toBeNull();

    const buttons = await screen.findAllByRole('button', { name: 'Get AI Feedback' });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute('aria-disabled')).not.toBe('true');
    }
  });

  it('button gate reason is exposed deterministically in UI copy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('running'),
          review: null,
          stale: false,
          state: 'processing',
          terminal: false,
          shouldPoll: true,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const gate = await screen.findByTestId('founder-feedback-generation-block-reason');
    expect(gate.textContent).toContain('already_polling');
  });

  it('honors terminal shouldPoll=false even when latest run status is queued', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        data: {
          latestRun: {
            ...buildRun('queued'),
            errorCode: 'AI_PROVIDER_NOT_CONFIGURED',
            errorMessage: 'AI review is not configured yet. Groq is selected, but no API key is available to process this request.',
          },
          review: null,
          stale: false,
          state: 'failed',
          shouldPoll: false,
          terminal: true,
        },
      }),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('AI review is not configured yet. Groq is selected, but no API key is available to process this request.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Get AI Feedback' }).length).toBeGreaterThan(0);

    const settledCallCount = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(fetchMock.mock.calls.length).toBe(settledCallCount);
  });

  it('sends regenerate=true from regenerate controls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('succeeded'),
            review: buildReview(),
            stale: false,
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('queued'),
            review: buildReview(),
            stale: false,
          },
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const regenerateButton = await screen.findByRole('button', { name: 'Regenerate AI Review' });
    await userEvent.click(regenerateButton);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall?.[1]?.body).toBe(
        JSON.stringify({ regenerate: true, forceNewRun: true }),
      );
    });
  });

  it('copy action writes rewrite text to clipboard', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('succeeded'),
            review: buildReview(),
            stale: false,
          },
        }),
      );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const copyButton = await screen.findByRole('button', { name: 'Copy rewrite' });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('Title: Launch Readiness QA Copilot'),
      );
    });
  });

  it('keeps premium structure with long text content', async () => {
    const longText = 'Long founder memo text. '.repeat(120);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            latestRun: buildRun('succeeded'),
            review: buildReview({ summary: longText, rewrite: `Title: Long\nBody: ${longText}` }),
            stale: false,
          },
        }),
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    expect(await screen.findByText('Rewrite Block')).toBeTruthy();
    expect(screen.getByText('Score Breakdown')).toBeTruthy();
    expect(screen.getByText('Market Signals')).toBeTruthy();
    expect(screen.getByText('Reasoning Trail')).toBeTruthy();
  });

  it('polling is bounded and stops after succeeded terminal state', async () => {
    const succeededState = {
      data: {
        latestRun: buildRun('succeeded'),
        review: buildReview(),
        stale: false,
        state: 'succeeded',
        shouldPoll: false,
        terminal: true,
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          shouldPoll: true,
          terminal: false,
        },
      }))
      .mockResolvedValue(response(succeededState));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Latest AI review is ready.')).toBeTruthy();
    }, { timeout: 8000 });

    const callCountAfterSuccess = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(fetchMock.mock.calls.length - callCountAfterSuccess).toBeLessThanOrEqual(1);
  }, 15000);

  it('pauses polling after repeated temporary failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          shouldPoll: true,
          terminal: false,
        },
      }))
      .mockResolvedValue(response({
        error: {
          code: 'ANALYSIS_SERVICE_UNAVAILABLE',
          message: 'Temporary outage',
        },
      }, 503));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Polling is paused to avoid repeated failed requests.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Resume Polling' })).toBeTruthy();
    }, { timeout: 12000 });

    const callCountAfterPause = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const callCountAfterSettling = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(fetchMock.mock.calls.length - callCountAfterSettling).toBeLessThanOrEqual(1);
    expect(callCountAfterSettling).toBeGreaterThanOrEqual(callCountAfterPause);
  }, 15000);

  it('stops polling and shows session guidance on repeated unauthorized responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          shouldPoll: true,
          terminal: false,
        },
      }))
      .mockResolvedValue(response({
        error: {
          code: 'UNAUTHORIZED',
          message: 'You need to sign in.',
        },
      }, 401));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Session issue detected during polling/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Resume Polling' })).toBeTruthy();
    }, { timeout: 8000 });

    const callCountAfterUnauthorized = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(fetchMock.mock.calls.length - callCountAfterUnauthorized).toBeLessThanOrEqual(1);
  }, 15000);

  it('does not overlap poll requests while a poll fetch is still in flight', async () => {
    let inFlight = 0;
    let overlapped = false;
    let callNumber = 0;

    let resolvePendingPoll: ((value: MockFetchResponse) => void) | undefined;
    const pendingPoll = new Promise<MockFetchResponse>((resolve) => {
      resolvePendingPoll = (value: MockFetchResponse) => {
        resolve(value);
      };
    });

    const fetchMock = vi.fn(() => {
      callNumber += 1;
      if (callNumber > 2 && inFlight > 0) {
        overlapped = true;
      }
      inFlight += 1;

      const settle = (promise: Promise<MockFetchResponse>) =>
        promise.finally(() => {
          inFlight -= 1;
        }) as unknown as Promise<Response>;

      if (callNumber === 1) {
        return settle(Promise.resolve(response({
          data: {
            latestRun: buildRun('queued'),
            review: null,
            stale: false,
            state: 'queued',
            shouldPoll: true,
            terminal: false,
          },
        })));
      }

      if (callNumber === 2) {
        return settle(pendingPoll);
      }

      return settle(Promise.resolve(response({
        data: {
          latestRun: buildRun('failed'),
          review: null,
          stale: false,
          state: 'failed',
          shouldPoll: false,
          terminal: true,
        },
      })));
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 8000 });

    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(overlapped).toBe(false);

    resolvePendingPoll?.(response({
      data: {
        latestRun: buildRun('failed'),
        review: null,
        stale: false,
        state: 'failed',
        shouldPoll: false,
        terminal: true,
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry AI Feedback' })).toBeTruthy();
    });
  }, 15000);

  it('keeps last successful review visible while refresh runs after regenerate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('succeeded'),
          review: buildReview(),
          stale: false,
          state: 'succeeded',
          shouldPoll: false,
          terminal: true,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run: buildRun('queued'), reused: false } }))
      .mockResolvedValueOnce(response({
        data: {
          latestRun: buildRun('queued'),
          review: null,
          stale: false,
          state: 'queued',
          shouldPoll: true,
          terminal: false,
        },
      }));

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      React.createElement(FounderIdeaFeedbackPanel, {
        ideaId: 'idea-1',
        canRequest: true,
      }),
    );

    const regenerateButton = await screen.findByRole('button', { name: 'Regenerate AI Review' });
    await userEvent.click(regenerateButton);

    await waitFor(() => {
      expect(screen.getByText('Hero Verdict')).toBeTruthy();
      expect(screen.getByText('Rewrite Block')).toBeTruthy();
    });
  }, 15000);
});
