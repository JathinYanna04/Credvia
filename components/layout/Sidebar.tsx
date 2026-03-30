import Link from 'next/link';
import { BriefcaseBusiness, Lightbulb } from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { PrimaryNav } from '@/components/layout/PrimaryNav';
import type { PrimaryNavItem } from '@/components/layout/PrimaryNav';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
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
    { href: '/communities', label: 'My Communities', icon: 'communities' },
    { href: '/notifications', label: 'Notifications', icon: 'notifications', badge: unreadNotifications },
    { href: `/u/${currentUser.username}`, label: 'Profile', icon: 'profile' },
  ];
  const topReputation = currentUser.reputation[0];

  return (
    <aside className="hidden h-screen w-[280px] shrink-0 border-r border-border-subtle px-5 py-5 lg:flex lg:flex-col">
      <Link href="/feed" className="mb-8 space-y-1">
        <div className="font-display text-xl font-semibold tracking-tight text-text-primary">Credvia</div>
        <p className="text-xs text-text-tertiary">Build reputation through contribution.</p>
      </Link>

      <PrimaryNav items={primaryItems} />

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

      <div className="mt-6 rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">More from Credvia</div>
          <div className="space-y-1">
            <Link href="/ideas" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
              <Lightbulb className="h-4 w-4" />
              Startup Ideas
            </Link>
            <Link href="/career-match" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
              <BriefcaseBusiness className="h-4 w-4" />
              Career Match
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-auto rounded-3xl border border-border-subtle bg-bg-surface p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-accent/10 text-sm font-semibold text-accent">
              {currentUser.fullName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold text-text-primary">{currentUser.fullName}</div>
            <div className="text-xs text-text-tertiary">@{currentUser.username}</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-bg-overlay px-3 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Growth</div>
          <p className="mt-1 text-sm text-text-primary">
            {topReputation
              ? `${topReputation.score} reputation in ${topReputation.communityName}`
              : 'Ask or answer to start earning reputation.'}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <ThemeToggle compact />
          <Link href="/settings" className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
            Settings
          </Link>
          <LogoutButton compact className="ml-auto h-10 px-3 text-sm" />
        </div>
      </div>
    </aside>
  );
}
