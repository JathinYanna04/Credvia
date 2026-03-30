import { MapPin, Building2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { UserSummary } from '@/lib/types';
import { ReputationBadge } from '@/components/reputation/ReputationBadge';

export interface ProfileHeaderProps {
  user: UserSummary;
  showFollowAction?: boolean;
}

export function ProfileHeader({ user, showFollowAction = false }: ProfileHeaderProps) {
  return (
    <header className="surface-panel p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-lg">
              {user.fullName
                .split(' ')
                .map((item) => item[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-semibold">{user.fullName}</h1>
            <p className="mt-1 font-mono text-sm text-text-tertiary">@{user.username}</p>
            <p className="mt-3 max-w-2xl text-sm text-text-secondary">{user.headline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
              {user.location ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {user.location}
                </span>
              ) : null}
              {user.currentCompany ? (
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {user.currentCompany}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {showFollowAction ? <Button variant="secondary">Follow</Button> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {user.reputation.map((item) => (
          <ReputationBadge
            key={item.communityId}
            score={item.score}
            communityName={item.communityName}
          />
        ))}
      </div>
    </header>
  );
}
