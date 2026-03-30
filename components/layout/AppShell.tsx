import type { PropsWithChildren } from 'react';
import { MobileNav } from '@/components/layout/MobileNav';
import { RightPanel } from '@/components/layout/RightPanel';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <>
      <TopBar />
      <div className="mx-auto flex min-h-screen w-full max-w-shell">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
        <RightPanel />
      </div>
      <MobileNav />
    </>
  );
}
