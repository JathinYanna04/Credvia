'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Compass, Home, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const iconMap = {
  home: Home,
  explore: Compass,
  communities: Users,
  notifications: Bell,
  profile: User,
} as const;

type PrimaryNavIcon = keyof typeof iconMap;
export type { PrimaryNavIcon };

export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: PrimaryNavIcon;
  badge?: number;
}

export function PrimaryNav({
  items,
  mobile = false,
}: {
  items: PrimaryNavItem[];
  mobile?: boolean;
}) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <>
        {items.map((item) => {
          const Icon = iconMap[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== '/feed' && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                'relative inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                active
                  ? 'bg-accent/12 text-accent shadow-sm'
                  : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.badge && item.badge > 0 ? (
                <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold text-white">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <nav className="space-y-1.5">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active =
          pathname === item.href ||
          (item.href !== '/feed' && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors',
              active
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="ml-auto rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
