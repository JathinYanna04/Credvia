'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ModerationActionButtonsProps {
  reportId: string;
}

export function ModerationActionButtons({ reportId }: ModerationActionButtonsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (action: 'dismiss' | 'hide' | 'remove') => {
    setLoadingAction(action);
    setError(null);

    const response = await fetch('/api/v1/mod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, action }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(payload?.error?.message ?? 'Moderation action failed.');
      setLoadingAction(null);
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={Boolean(loadingAction)} onClick={() => void submit('dismiss')}>
          {loadingAction === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => void submit('hide')}>
          {loadingAction === 'hide' ? 'Hiding...' : 'Hide'}
        </Button>
        <Button type="button" disabled={Boolean(loadingAction)} onClick={() => void submit('remove')}>
          {loadingAction === 'remove' ? 'Removing...' : 'Remove'}
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
