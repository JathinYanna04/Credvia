'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface JoinButtonProps {
  communityId: string;
  initialJoined: boolean;
}

export function JoinButton({ communityId, initialJoined }: JoinButtonProps) {
  const [joined, setJoined] = useState(initialJoined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-2">
      <Button
        variant={joined ? 'secondary' : 'default'}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          setAuthExpired(false);
          const nextJoined = !joined;
          const response = await fetch(`/api/v1/communities/${communityId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ communityId, joined: nextJoined }),
          });

          if (response.status === 401) {
            setAuthExpired(true);
            setLoading(false);
            return;
          }

          if (response.ok) {
            setJoined(nextJoined);
            router.refresh();
          } else {
            const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
            setError(payload?.error?.message ?? 'Could not update community membership.');
          }

          setLoading(false);
        }}
      >
        {loading ? 'Updating...' : joined ? 'Joined' : 'Join community'}
      </Button>
      {authExpired ? (
        <p className="text-sm text-danger">
          Your session expired. <Link href="/login" className="text-accent">Sign in again</Link>.
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
