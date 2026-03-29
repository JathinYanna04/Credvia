import { JoinButton } from '@/components/community/JoinButton';
import type { CommunitySummary } from '@/lib/types';
import { formatCompactNumber } from '@/lib/utils/format';

export interface CommunityHeaderProps {
  community: CommunitySummary;
  initialJoined?: boolean;
}

export function CommunityHeader({
  community,
  initialJoined = false,
}: CommunityHeaderProps) {
  return (
    <header className="overflow-hidden rounded-3xl border border-border-subtle bg-bg-surface">
      <div className="h-36 bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(17,17,19,1))]" />
      <div className="px-6 pb-6">
        <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border-default bg-bg-base text-2xl font-semibold text-accent">
              {community.icon}
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{community.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">{community.description}</p>
            <div className="mt-4 flex gap-4 text-xs uppercase tracking-[0.16em] text-text-tertiary">
              <span>{formatCompactNumber(community.memberCount)} members</span>
              <span>{formatCompactNumber(community.postCount)} posts</span>
            </div>
          </div>
          <JoinButton communityId={community.id} initialJoined={initialJoined} />
        </div>
      </div>
    </header>
  );
}
