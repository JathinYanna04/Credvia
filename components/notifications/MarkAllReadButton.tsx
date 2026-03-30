'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          setAuthExpired(false);
          const response = await fetch('/api/v1/notifications', { method: 'PATCH' });

          if (response.status === 401) {
            setAuthExpired(true);
            setLoading(false);
            return;
          }

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
            setError(payload?.error?.message ?? 'Could not update notifications.');
            setLoading(false);
            return;
          }

          router.refresh();
          setLoading(false);
        }}
      >
        {loading ? 'Updating...' : 'Mark all read'}
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
