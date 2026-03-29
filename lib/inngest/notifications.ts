import { inngest } from '@/lib/inngest/client';

export const notificationEvent = inngest.createFunction(
  { id: 'send-notification' },
  { event: 'credvia/notification.send' },
  async ({ event }) => ({
    delivered: true,
    type: event.data.notifType,
  }),
);
