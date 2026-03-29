'use client';

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
  const router = useRouter();

  return (
    <Button
      variant={joined ? 'secondary' : 'default'}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const nextJoined = !joined;
        const response = await fetch(`/api/v1/communities/${communityId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, joined: nextJoined }),
        });

        if (response.ok) {
          setJoined(nextJoined);
          router.refresh();
        }

        setLoading(false);
      }}
    >
      {loading ? 'Updating...' : joined ? 'Joined' : 'Join community'}
    </Button>
  );
}
