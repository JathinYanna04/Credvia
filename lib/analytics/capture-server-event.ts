import { createPostHogServerClient } from '@/lib/analytics/posthog-server';

interface CaptureServerEventInput {
  event: string;
  distinctId?: string | null;
  properties?: Record<string, unknown>;
}

export async function captureServerEvent({
  event,
  distinctId,
  properties = {},
}: CaptureServerEventInput) {
  if (
    !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    !process.env.NEXT_PUBLIC_POSTHOG_HOST
  ) {
    return;
  }

  if (!distinctId) {
    return;
  }

  let posthog: ReturnType<typeof createPostHogServerClient> = null;

  try {
    posthog = createPostHogServerClient();

    if (!posthog) {
      return;
    }

    posthog.capture({
      event,
      distinctId,
      properties,
    });
  } catch (error) {
    console.error('[posthog] captureServerEvent failed', error);
  } finally {
    if (posthog) {
      try {
        await posthog.shutdown();
      } catch (error) {
        console.error('[posthog] captureServerEvent shutdown failed', error);
      }
    }
  }
}
