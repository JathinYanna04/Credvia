// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  global.fetch = originalFetch;
});

describe('FounderIdeaFeedbackPanel', () => {
  it('clicking Get AI Feedback starts a request', async () => {
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
      expect(postCall?.[1]?.body).toBe(JSON.stringify({ regenerate: false }));
    });
  });

  it('shows processing status when run is queued or running', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ data: { latestRun: buildRun('running'), review: null, stale: false } }));

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
      expect(postCall?.[1]?.body).toBe(JSON.stringify({ regenerate: true }));
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
});
