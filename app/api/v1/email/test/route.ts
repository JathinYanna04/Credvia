import { ok } from '@/lib/api';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';

const TEST_EMAIL_TO = 'delivered@resend.dev';

export async function POST() {
  const result = await sendWelcomeEmail({
    to: TEST_EMAIL_TO,
    name: 'Credvia Local Test',
  });

  return ok({
    ...result,
    to: TEST_EMAIL_TO,
  });
}
