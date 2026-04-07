import { ArrowUpRight, Building2, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StartDirectMessageButton } from '@/components/chat/StartDirectMessageButton';
import { getPersonaDefinition } from '@/lib/personas';
import type { UserSummary } from '@/lib/types';
import { ReputationBadge } from '@/components/reputation/ReputationBadge';

export interface ProfileHeaderProps {
  user: UserSummary;
  currentUserId?: string | null;
  showFollowAction?: boolean;
  editHref?: string | null;
  contributionCount?: number;
  commentCount?: number;
}

export function ProfileHeader({
  user,
  currentUserId,
  showFollowAction = false,
  editHref = null,
  contributionCount = 0,
  commentCount = 0,
}: ProfileHeaderProps) {
  const totalReputation = user.reputation.reduce((sum, item) => sum + item.score, 0);
  const persona = user.primaryPersona ? getPersonaDefinition(user.primaryPersona) : null;
  const secondaryPersonas = (user.secondaryPersonas ?? []).map((item) => getPersonaDefinition(item));
  const personaHighlights = user.personaDetails
    ? Object.values(user.personaDetails).filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];

  return (
    <header className="surface-panel overflow-hidden rounded-[28px] p-0 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
      <div className="border-b border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.92))] px-6 py-7 sm:px-8 dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_34%),linear-gradient(180deg,rgba(17,24,39,0.95),rgba(15,23,42,0.92))]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
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
                {persona ? `${persona.label} profile` : 'Reputation-led profile'}
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                {user.fullName}
              </h1>
              <p className="mt-1 font-mono text-sm text-text-tertiary">@{user.username}</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                {user.headline || 'Building credibility one useful contribution at a time.'}
              </p>
              {persona ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{persona.label}</Badge>
                  {secondaryPersonas.map((item) => (
                    <Badge key={item.slug} variant="secondary">
                      {item.label}
                    </Badge>
                  ))}
                  {user.openTo?.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                  <Badge variant="secondary">{persona.shortDescription}</Badge>
                  {user.badge ? <Badge variant="secondary">{user.badge}</Badge> : null}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
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

          <div className="flex flex-wrap gap-3 lg:max-w-[280px] lg:justify-end">
            {editHref ? (
              <Button asChild variant="secondary">
                <Link href={editHref}>Edit profile</Link>
              </Button>
            ) : null}
            {!editHref ? (
              <StartDirectMessageButton
                currentUserId={currentUserId}
                targetUserId={user.id}
                label="Message"
                variant="secondary"
              />
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

      <div className="grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-border-subtle bg-bg-base p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Reputation</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-text-primary">{totalReputation}</div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Earned through questions, answers, and useful contributions across communities.
          </p>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Credibility</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">
                {user.scoreSummary?.credibility_score ?? 0}
              </div>
            </div>
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Public posts</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">{contributionCount}</div>
            </div>
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Public replies</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">{commentCount}</div>
            </div>
            <div className="rounded-2xl bg-bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Contribution</div>
              <div className="mt-1 text-xl font-semibold text-text-primary">
                {user.scoreSummary?.contribution_score ?? 0}
              </div>
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
          {personaHighlights.length > 0 ? (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Persona highlights</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {personaHighlights.slice(0, 4).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
                  >
                    {item}
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
