'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';

export interface CommunityPickerProps {
  onComplete?: () => void;
}

interface CommunityOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
}

export function CommunityPicker({ onComplete }: CommunityPickerProps) {
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void fetch('/api/v1/communities')
      .then((response) => response.json())
      .then((payload: { data?: CommunityOption[] }) => setCommunities(payload.data ?? []));
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    await supabase
      .from('community_memberships')
      .delete()
      .eq('user_id', user.id);

    await Promise.all(
      selected.map((communityId) =>
        fetch(`/api/v1/communities/${communityId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, joined: true }),
        }),
      ),
    );

    onComplete?.();
    router.push('/onboarding/profile');
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {communities.map((community) => {
          const active = selected.includes(community.id);
          return (
            <button
              key={community.id}
              type="button"
              onClick={() =>
                setSelected((current) =>
                  active
                    ? current.filter((item) => item !== community.id)
                    : [...current, community.id],
                )
              }
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                active
                  ? 'border-accent bg-[rgba(34,211,238,0.08)]'
                  : 'border-border-subtle bg-bg-surface hover:border-border-default',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{community.name}</h3>
                  <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                </div>
                {active ? (
                  <div className="rounded-full bg-accent p-1 text-bg-base">
                    <Check className="h-3 w-3" />
                  </div>
                ) : null}
              </div>
              <Badge variant="secondary" className="mt-4">
                {community.member_count.toLocaleString()} members
              </Badge>
            </button>
          );
        })}
      </div>
      <Button onClick={handleContinue} disabled={loading}>
        {loading ? 'Joining...' : 'Continue'}
      </Button>
    </div>
  );
}
