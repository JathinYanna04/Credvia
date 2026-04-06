import Link from 'next/link';
import { Bell, MessageCircle, Plus, Search } from 'lucide-react';
import { ShellUserMenu } from '@/components/layout/ShellUserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function TopBar() {
  const { currentUser, unreadNotifications } = await getAppShellData();

  return (
    <div className="shell-topbar-surface sticky top-0 z-30 border-b border-border-subtle">
      <div className="content-shell flex w-full items-center gap-3 px-4 py-3 sm:px-2 lg:gap-4 xl:gap-5">
        <div className="min-w-0 flex flex-1 items-center">
          <Link href="/feed" className="font-display text-lg font-semibold text-text-primary lg:hidden">
            Credvia
          </Link>
          <Link
            href="/explore"
            className="hidden h-11 min-w-[280px] max-w-[560px] flex-1 items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface px-4 text-sm text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary lg:flex xl:min-w-[360px]"
          >
            <Search className="h-4 w-4" />
            Search posts, people, and communities
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5 xl:gap-3">
          <Link
            href="/explore"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary lg:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Link>
          <Link
            href="/post/new"
            className="hidden h-11 items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] px-4 text-sm font-medium text-white shadow-[0_14px_28px_rgba(99,102,241,0.22)] transition-all duration-200 hover:-translate-y-0.5 md:inline-flex"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xl:inline">Ask or share</span>
            <span className="xl:hidden">Post</span>
          </Link>
          <Link
            href="/notifications"
            className="relative hidden h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary md:inline-flex"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <Link
            href="/messages"
            className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary shadow-sm transition-colors hover:border-border-default hover:text-text-primary md:inline-flex"
            aria-label="Messages"
          >
            <MessageCircle className="h-4 w-4" />
          </Link>
          <div className="hidden xl:block">
            <ThemeToggle compact />
          </div>
          {currentUser ? <ShellUserMenu username={currentUser.username} fullName={currentUser.fullName} /> : null}
        </div>
      </div>
    </div>
  );
}
