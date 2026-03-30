'use client';

import { useEffect } from 'react';
import posthog from '@/lib/analytics/posthog-client';

interface IdeaOpenedTrackerProps {
  ideaId: string;
}

export function IdeaOpenedTracker({ ideaId }: IdeaOpenedTrackerProps) {
  useEffect(() => {
    posthog.capture('idea_opened', {
      ideaId,
    });
  }, [ideaId]);

  return null;
}
