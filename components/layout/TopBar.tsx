import Link from 'next/link';
import { Bell, Search, User } from 'lucide-react';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function TopBar() {
  const { currentUser, unreadNotifications } = await getAppShellData();

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border-subtle bg-bg-base px-4 py-4 backdrop-blur lg:hidden">
      <Link href="/feed" className="font-display text-lg font-semibold">
        Credvia
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/explore?q=" className="rounded-full border border-border-subtle p-2 text-text-secondary" aria-label="Search">
          <Search className="h-4 w-4" />
        </Link>
        <Link href="/notifications" className="relative rounded-full border border-border-subtle p-2 text-text-secondary" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadNotifications > 0 ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-bg-base">
              {unreadNotifications}
            </span>
          ) : null}
        </Link>
        {currentUser ? (
          <Link href={`/u/${currentUser.username}`} className="rounded-full border border-border-subtle p-2 text-text-secondary" aria-label="Profile">
            <User className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
