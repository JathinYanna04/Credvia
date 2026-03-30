import Link from 'next/link';
import { Bell, Plus, Search } from 'lucide-react';
import { ShellUserMenu } from '@/components/layout/ShellUserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function TopBar() {
  const { currentUser, unreadNotifications } = await getAppShellData();

  return (
    <div className="sticky top-0 z-30 border-b border-border-subtle bg-[rgba(246,247,251,0.92)] backdrop-blur dark:bg-[rgba(17,19,24,0.92)]">
      <div className="mx-auto flex w-full max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-5 lg:px-8">
        <div className="min-w-0 flex-1">
          <Link href="/feed" className="font-display text-lg font-semibold text-text-primary lg:hidden">
            Credvia
          </Link>
          <Link
            href="/explore"
            className="hidden h-11 items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface px-4 text-sm text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary lg:flex"
          >
            <Search className="h-4 w-4" />
            Search posts, people, and communities
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/explore"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary lg:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Link>
          <Link
            href="/post/new"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-medium text-white shadow-[0_12px_24px_rgba(79,70,229,0.18)] transition-colors hover:bg-accent-dim"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ask or share</span>
          </Link>
          <Link
            href="/notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <div className="hidden lg:block">
            <ThemeToggle compact />
          </div>
          {currentUser ? <ShellUserMenu username={currentUser.username} fullName={currentUser.fullName} /> : null}
        </div>
      </div>
    </div>
  );
}
