'use client';

import { cn } from '@/lib/utils/cn';

export interface ScrollablePillTabItem<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

export interface ScrollablePillTabsProps<T extends string> {
  items: ScrollablePillTabItem<T>[];
  value: T;
  onValueChange?: (value: T) => void;
  className?: string;
  sticky?: boolean;
}

export function ScrollablePillTabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
  sticky = false,
}: ScrollablePillTabsProps<T>) {
  return (
    <div
      className={cn(
        sticky &&
          'sticky top-[65px] z-20 -mx-4 border-b border-border-subtle bg-[rgba(246,247,251,0.96)] px-4 py-2 backdrop-blur dark:bg-[rgba(17,19,24,0.96)] sm:top-[73px]',
        className,
      )}
    >
      <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex min-w-full gap-2">
          {items.map((item) => {
            const active = item.value === value;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onValueChange?.(item.value)}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                  active
                    ? 'bg-accent text-white shadow-[0_10px_22px_rgba(79,70,229,0.22)]'
                    : 'bg-bg-surface text-text-secondary shadow-sm ring-1 ring-border-subtle hover:text-text-primary',
                )}
              >
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      active ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent',
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
