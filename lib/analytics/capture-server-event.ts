import { createPostHogServerClient } from '@/lib/analytics/posthog-server';

interface CaptureServerEventInput {
  event: string;
  distinctId?: string | null;
  properties?: Record<string, unknown>;
}

export async function captureServerEvent({
  event,
  distinctId,
  properties,
}: CaptureServerEventInput) {
  if (!distinctId) {
    return;
  }

  const posthog = createPostHogServerClient();

  if (!posthog) {
    return;
  }

  try {
    posthog.capture({
      event,
      distinctId,
      properties,
    });
  } finally {
    await posthog.shutdown();
  }
}
