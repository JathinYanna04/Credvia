import Link from 'next/link';
import { Bell, Compass, Feather, Home, Lightbulb, Settings } from 'lucide-react';
import { mockCommunities, mockUsers } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function Sidebar() {
  const user = mockUsers[0] ?? {
    id: 'fallback-user',
    username: 'credvia',
    fullName: 'Credvia User',
    headline: 'Builder',
    avatarUrl: '',
    skills: [],
    reputation: [],
  };

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
        <Link href="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Bell className="h-4 w-4" />
          Notifications
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
          {mockCommunities.map((community) => (
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
              {user.fullName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm text-text-primary">{user.fullName}</div>
            <div className="text-xs text-text-tertiary">@{user.username}</div>
          </div>
        </div>
        <Link href="/settings" aria-label="Settings" className="rounded-full p-2 text-text-secondary hover:bg-bg-overlay hover:text-text-primary">
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  );
}
