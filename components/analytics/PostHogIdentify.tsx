'use client';

import { useEffect } from 'react';
import posthog from '@/lib/analytics/posthog-client';

interface PostHogIdentifyProps {
  distinctId: string | null;
}

export function PostHogIdentify({ distinctId }: PostHogIdentifyProps) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
      return;
    }

    if (distinctId) {
      posthog.identify(distinctId);
      return;
    }

    posthog.reset();
  }, [distinctId]);

  return null;
}
