import { PrimaryNav } from '@/components/layout/PrimaryNav';
import type { PrimaryNavItem } from '@/components/layout/PrimaryNav';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function MobileNav() {
  const { currentUser, unreadNotifications } = await getAppShellData();

  const items: PrimaryNavItem[] = [
    { href: '/feed', label: 'Home', icon: 'home' },
    { href: '/explore', label: 'Explore', icon: 'explore' },
    { href: '/post/new', label: 'Create', icon: 'create', accent: true },
    { href: '/notifications', label: 'Notifications', icon: 'notifications', badge: unreadNotifications },
    { href: currentUser ? `/u/${currentUser.username}` : '/login', label: 'Profile', icon: 'profile' },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-[rgba(255,255,255,0.96)] px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 shadow-[0_-14px_36px_rgba(15,23,42,0.08)] backdrop-blur dark:bg-[rgba(23,26,33,0.96)] lg:hidden">
      <PrimaryNav items={items} mobile />
    </nav>
  );
}
