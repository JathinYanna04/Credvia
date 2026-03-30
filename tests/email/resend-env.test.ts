import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resend email env safety', () => {
  const originalApiKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }

    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null from getResendClient when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const { getResendClient } = await import('@/lib/email/resend');

    expect(getResendClient()).toBeNull();
  });

  it('skips welcome email safely when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const { sendWelcomeEmail } = await import('@/lib/email/send-welcome-email');

    await expect(
      sendWelcomeEmail({
        to: 'test@example.com',
        name: 'Credvia',
      }),
    ).resolves.toEqual({
      sent: false,
      reason: 'missing_api_key',
    });
  });

  it('skips resume analysis email safely when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const { sendResumeAnalysisEmail } = await import('@/lib/email/send-resume-analysis-email');

    await expect(
      sendResumeAnalysisEmail({
        to: 'test@example.com',
        name: 'Credvia',
      }),
    ).resolves.toEqual({
      sent: false,
      reason: 'missing_api_key',
    });
  });
});
