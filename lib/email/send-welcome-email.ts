import { resend } from '@/lib/email/resend';

interface SendWelcomeEmailInput {
  to: string;
  name?: string | null;
}

export async function sendWelcomeEmail({
  to,
  name,
}: SendWelcomeEmailInput) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const firstName = name?.trim() || 'there';

  try {
    if (!process.env.RESEND_API_KEY) {
      return { sent: false as const, reason: 'missing_api_key' };
    }

    await resend.emails.send({
      from: 'Credvia <onboarding@resend.dev>',
      to,
      subject: 'Welcome to Credvia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Welcome to Credvia</h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 12px;">Hi ${firstName},</p>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 12px;">
            Your Credvia account is ready. Start building signal through your profile, contributions, and Career Match setup.
          </p>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
            A good next step is uploading your resume so Credvia can turn it into a structured match profile.
          </p>
          <a
            href="${appUrl}/resume"
            style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;"
          >
            Upload your resume
          </a>
        </div>
      `,
    });

    return { sent: true as const };
  } catch (error) {
    console.error('[email] failed:', error);
    return { sent: false as const, reason: 'send_failed' };
  }
}
