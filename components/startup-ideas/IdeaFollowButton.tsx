'use client';

import { useState } from 'react';
import { BellPlus, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IdeaFollowButtonProps {
  postId: string;
  initialFollowing: boolean;
  initialFollowerCount: number;
}

export function IdeaFollowButton({
  postId,
  initialFollowing,
  initialFollowerCount,
}: IdeaFollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFollow = async () => {
    if (loading) {
      return;
    }

    const nextFollowing = !following;
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/v1/ideas/${postId}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ following: nextFollowing }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: { following?: boolean; followerCount?: number }; error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? 'Could not update idea follow state.');
      setLoading(false);
      return;
    }

    setFollowing(payload?.data?.following ?? nextFollowing);
    setFollowerCount(payload?.data?.followerCount ?? followerCount + (nextFollowing ? 1 : -1));
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant={following ? 'secondary' : 'outline'} onClick={() => void toggleFollow()} disabled={loading}>
        {following ? <CheckCheck className="h-4 w-4" /> : <BellPlus className="h-4 w-4" />}
        {following ? 'Following' : 'Follow idea'}
      </Button>
      <p className="text-xs text-text-secondary">
        {followerCount} follower{followerCount === 1 ? '' : 's'}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
