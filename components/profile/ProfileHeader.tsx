import { ArrowUpRight, Building2, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { UserSummary } from '@/lib/types';
import { ReputationBadge } from '@/components/reputation/ReputationBadge';

export interface ProfileHeaderProps {
  user: UserSummary;
  showFollowAction?: boolean;
  editHref?: string | null;
  contributionCount?: number;
  commentCount?: number;
}

export function ProfileHeader({
  user,
  showFollowAction = false,
  editHref = null,
  contributionCount = 0,
  commentCount = 0,
}: ProfileHeaderProps) {
  const totalReputation = user.reputation.reduce((sum, item) => sum + item.score, 0);

  return (
    <header className="surface-panel overflow-hidden p-0">
      <div className="border-b border-border-subtle bg-gradient-to-br from-accent/8 via-bg-surface to-bg-base px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-20 w-20 ring-4 ring-bg-surface">
            <AvatarFallback className="bg-accent/10 text-lg font-semibold text-accent">
              {user.fullName
                .split(' ')
                .map((item) => item[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-bg-surface/90 px-3 py-1 text-xs font-medium text-accent shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                Reputation-led profile
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                {user.fullName}
              </h1>
              <p className="mt-1 font-mono text-sm text-text-tertiary">@{user.username}</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                {user.headline || 'Building credibility one useful contribution at a time.'}
              </p>
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

          <div className="flex flex-wrap gap-3">
            {editHref ? (
              <Button asChild variant="secondary">
                <Link href={editHref}>Edit profile</Link>
              </Button>
            ) : null}
            {showFollowAction ? <Button variant="secondary">Follow</Button> : null}
            <Button asChild>
              <Link href="/post/new">
                Ask or share
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-border-subtle bg-bg-base p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Reputation</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-text-primary">{totalReputation}</div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Earned through questions, answers, and useful contributions across communities.
          </p>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Public posts</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">{contributionCount}</div>
            </div>
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Public replies</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">{commentCount}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Where this user is strongest</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.reputation.length > 0 ? (
              user.reputation.map((item) => (
                <ReputationBadge
                  key={item.communityId}
                  score={item.score}
                  communityName={item.communityName}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border-default bg-bg-base px-4 py-4 text-sm text-text-secondary">
                Reputation starts building once people upvote useful work. A few sharp answers are enough to get momentum.
              </div>
            )}
          </div>
          {user.skills.length > 0 ? (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Signals people can scan fast</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {user.skills.slice(0, 8).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
