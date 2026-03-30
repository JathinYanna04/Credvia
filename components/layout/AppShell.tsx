import type { PropsWithChildren } from 'react';
import { MobileNav } from '@/components/layout/MobileNav';
import { RightPanel } from '@/components/layout/RightPanel';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

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
      <MobileNav />
    </div>
  );
}
