import Link from 'next/link';
import { Bell, BriefcaseBusiness, Compass, Feather, FileText, Home, Lightbulb, Search, User } from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function Sidebar() {
  const { currentUser, joinedCommunities, unreadNotifications } = await getAppShellData();

  if (!currentUser) {
    return null;
  }

  return (
    <aside className="hidden h-screen w-[240px] shrink-0 border-r border-border-subtle px-4 py-6 lg:flex lg:flex-col">
      <Link href="/feed" className="mb-8 font-display text-xl font-semibold tracking-tight">
        Credvia
      </Link>

      <nav className="space-y-2">
        <Link href="/feed" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-primary hover:bg-bg-overlay">
          <Home className="h-4 w-4" />
          Feed
        </Link>
        <Link href="/explore" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Compass className="h-4 w-4" />
          Explore
        </Link>
        <Link href="/ideas" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Lightbulb className="h-4 w-4" />
          Startup Ideas
        </Link>
        <Link href="/career-match" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <BriefcaseBusiness className="h-4 w-4" />
          Career Match
        </Link>
        <Link href="/resume" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <FileText className="h-4 w-4" />
          Resume
        </Link>
        <Link href="/explore?q=" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Search className="h-4 w-4" />
          Search
        </Link>
        <Link href="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Bell className="h-4 w-4" />
          Notifications
          {unreadNotifications > 0 ? (
            <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
              {unreadNotifications}
            </span>
          ) : null}
        </Link>
        <Link href={`/u/${currentUser.username}`} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <User className="h-4 w-4" />
          Profile
        </Link>
      </nav>

      <Button asChild className="mt-4 w-full justify-start">
        <Link href="/post/new">
          <Feather className="h-4 w-4" />
          Create Post
        </Link>
      </Button>

      <div className="mt-8">
        <p className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-text-tertiary">
          Your Communities
        </p>
        <div className="space-y-1">
          {joinedCommunities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle px-3 py-3 text-sm text-text-secondary">
              Join communities to personalize your feed.
            </div>
          ) : null}
          {joinedCommunities.map((community) => (
            <Link
              key={community.id}
              href={`/c/${community.slug}`}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-overlay font-mono text-[11px] text-accent">
                {community.icon}
              </div>
              <span>{community.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between rounded-2xl border border-border-subtle bg-bg-surface p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {currentUser.fullName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm text-text-primary">{currentUser.fullName}</div>
            <div className="text-xs text-text-tertiary">@{currentUser.username}</div>
          </div>
        </div>
        <LogoutButton compact className="h-9 px-3 text-xs" />
      </div>
    </aside>
  );
}
