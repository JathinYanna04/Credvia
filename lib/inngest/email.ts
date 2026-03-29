import { inngest } from '@/lib/inngest/client';

export const emailDigestJob = inngest.createFunction(
  { id: 'email-digest' },
  { cron: 'TZ=UTC 0 10 * * *' },
  async () => ({ queued: true }),
);
