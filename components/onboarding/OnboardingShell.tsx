import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils/cn';

export interface OnboardingShellProps extends PropsWithChildren {
  step: number;
  title: string;
  description: string;
  className?: string;
}

export function OnboardingShell({
  step,
  title,
  description,
  className,
  children,
}: OnboardingShellProps) {
  return (
    <div className={cn('mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10', className)}>
      <div className="mb-10 flex justify-center gap-2">
        {[1, 2, 3].map((dot) => (
          <div
            key={dot}
            className={cn(
              'h-2.5 rounded-full transition-all',
              step >= dot ? 'w-10 bg-accent' : 'w-2.5 bg-border-default',
            )}
          />
        ))}
      </div>
      <div className="surface-elevated mx-auto w-full max-w-3xl p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
