import Link from 'next/link';
import { Bell, Compass, Feather, Home, Lightbulb, User } from 'lucide-react';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function MobileNav() {
  const { currentUser } = await getAppShellData();

  return (
    <nav className="fixed bottom-4 left-1/2 z-30 flex w-[min(92vw,420px)] -translate-x-1/2 items-center justify-between rounded-2xl border border-border-default bg-bg-elevated px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)] lg:hidden">
      <Link href="/feed" aria-label="Feed" className="text-text-secondary">
        <Home className="h-5 w-5" />
      </Link>
      <Link href="/explore" aria-label="Explore" className="text-text-secondary">
        <Compass className="h-5 w-5" />
      </Link>
      <Link href="/ideas" aria-label="Startup ideas" className="text-text-secondary">
        <Lightbulb className="h-5 w-5" />
      </Link>
      <Link href="/post/new" aria-label="Create post" className="rounded-full bg-accent p-3 text-bg-base">
        <Feather className="h-5 w-5" />
      </Link>
      <Link href="/notifications" aria-label="Notifications" className="text-text-secondary">
        <Bell className="h-5 w-5" />
      </Link>
      <Link href={currentUser ? `/u/${currentUser.username}` : '/login'} aria-label="Profile" className="text-text-secondary">
        <User className="h-5 w-5" />
      </Link>
    </nav>
  );
}
