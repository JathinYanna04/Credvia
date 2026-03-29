import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';

export function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border-subtle bg-bg-base px-4 py-4 backdrop-blur lg:hidden">
      <Link href="/feed" className="font-display text-lg font-semibold">
        Credvia
      </Link>
      <div className="flex items-center gap-2">
        <button className="rounded-full border border-border-subtle p-2 text-text-secondary" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>
        <button className="rounded-full border border-border-subtle p-2 text-text-secondary" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
