import { Bell, Compass, Home, User, Users } from 'lucide-react';
import { PrimaryNav } from '@/components/layout/PrimaryNav';
import { getAppShellData } from '@/lib/supabase/app-shell';

export async function MobileNav() {
  const { currentUser, unreadNotifications } = await getAppShellData();

  const items = [
    { href: '/feed', label: 'Home', icon: Home },
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/communities', label: 'Communities', icon: Users },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { href: currentUser ? `/u/${currentUser.username}` : '/login', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 z-30 flex w-[min(94vw,440px)] -translate-x-1/2 items-center justify-between rounded-[1.4rem] border border-border-subtle bg-[rgba(255,255,255,0.96)] px-3 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.15)] backdrop-blur dark:bg-[rgba(23,26,33,0.96)] lg:hidden">
      <PrimaryNav items={items} mobile />
    </nav>
  );
}
