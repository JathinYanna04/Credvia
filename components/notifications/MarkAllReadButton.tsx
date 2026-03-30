'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch('/api/v1/notifications', { method: 'PATCH' });
        router.refresh();
        setLoading(false);
      }}
    >
      {loading ? 'Updating...' : 'Mark all read'}
    </Button>
  );
}
