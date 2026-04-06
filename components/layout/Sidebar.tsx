import Link from 'next/link';
import { Bell, BookMarked, BriefcaseBusiness, Compass, Lightbulb, Search } from 'lucide-react';
import { PrimaryNav } from '@/components/layout/PrimaryNav';
import type { PrimaryNavItem } from '@/components/layout/PrimaryNav';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function Sidebar() {
  const { currentUser, joinedCommunities, unreadNotifications, onboardingComplete } = await getAppShellData();

  if (!currentUser) {
    return null;
  }

  const primaryItems: PrimaryNavItem[] = [
    { href: '/feed', label: 'Home', icon: 'home' },
    { href: '/explore', label: 'Explore', icon: 'explore' },
    { href: '/career', label: 'Career', icon: 'career' },
    { href: '/notifications', label: 'Notifications', icon: 'notifications', badge: unreadNotifications },
  ];
  const topReputation = currentUser.reputation[0];

  return (
    <aside className="shell-sidebar-surface hidden h-screen w-[252px] shrink-0 border-r border-border-subtle px-4 py-5 xl:w-[264px] xl:px-5 lg:flex lg:flex-col">
      <Link href="/feed" className="mb-8 rounded-[22px] border border-border-subtle bg-bg-surface px-4 py-4 shadow-sm">
        <div className="font-display text-xl font-semibold tracking-tight text-text-primary">Credvia</div>
        <p className="mt-1 text-xs text-text-tertiary">Build reputation through contribution.</p>
      </Link>

      <PrimaryNav items={primaryItems} />

      <div className="mt-6 rounded-[22px] border border-border-subtle bg-bg-surface p-4 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Career tools</div>
        <div className="mt-4 space-y-1.5">
          <Link
            href="/resume"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
          >
            <BookMarked className="h-4 w-4" />
            Resume
          </Link>
          <Link
            href="/career/jobs"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
          >
            <Search className="h-4 w-4" />
            Job Search
          </Link>
          <Link
            href="/career-match"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Career Match
          </Link>
          <Link
            href="/career#saved"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary"
          >
            <Bell className="h-4 w-4" />
            Saved Jobs
          </Link>
        </div>
      </div>

      {!onboardingComplete ? (
        <div className="surface-panel mt-5 space-y-3 p-4">
          <div className="text-sm font-semibold text-text-primary">Finish your setup</div>
          <p className="text-sm text-text-secondary">
            You can keep reading now, then add skills and communities to sharpen your feed.
          </p>
          <Link href="/onboarding/interests" className="text-sm font-medium text-accent">
            Continue onboarding
          </Link>
        </div>
      ) : null}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between px-3">
          <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Your Communities</p>
          <Link href="/communities" className="text-xs font-medium text-accent">
            See all
          </Link>
        </div>
        <div className="space-y-1.5">
          {joinedCommunities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-4 text-sm text-text-secondary">
              No communities yet. Explore a few to personalize your home feed.
            </div>
          ) : null}
          {joinedCommunities.map((community) => (
            <Link
              key={community.id}
              href={`/c/${community.slug}`}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-overlay font-mono text-[11px] font-semibold text-accent">
                {community.icon}
              </div>
              <span className="truncate">{community.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-[22px] border border-border-subtle bg-bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">More from Credvia</div>
          <div className="space-y-1">
            <Link href="/ideas" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
              <Lightbulb className="h-4 w-4" />
              Startup Ideas
            </Link>
            <Link href="/communities" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
              <Compass className="h-4 w-4" />
              Communities
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-auto rounded-[24px] border border-border-subtle bg-bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-accent/10 text-sm font-semibold text-accent">
              {currentUser.fullName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary">{currentUser.fullName}</div>
            <div className="truncate text-xs text-text-tertiary">@{currentUser.username}</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-bg-overlay px-3 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Growth</div>
          <p className="mt-1 text-sm leading-6 text-text-primary">
            {topReputation
              ? `${topReputation.score} reputation in ${topReputation.communityName}`
              : 'Ask or answer to start earning reputation.'}
          </p>
        </div>
      </div>
    </aside>
  );
}
