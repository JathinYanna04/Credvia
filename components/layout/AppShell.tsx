import type { PropsWithChildren } from 'react';
import { MobileNav } from '@/components/layout/MobileNav';
import { RightPanel } from '@/components/layout/RightPanel';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-shell">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="min-w-0 px-4 pb-24 pt-5 sm:px-5 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
        </div>
        <RightPanel />
      </div>
      <Link
        href="/post/new"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_16px_36px_rgba(79,70,229,0.28)] transition active:scale-[0.97] lg:hidden"
        aria-label="Create a post"
      >
        <Plus className="h-6 w-6" />
      </Link>
      <MobileNav />
    </div>
  );
}
