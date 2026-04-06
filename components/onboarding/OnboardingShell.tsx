import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils/cn';

export interface OnboardingShellProps extends PropsWithChildren {
  step: number;
  steps?: number;
  title: string;
  description: string;
  className?: string;
}

export function OnboardingShell({
  step,
  steps = 3,
  title,
  description,
  className,
  children,
}: OnboardingShellProps) {
  return (
    <div className={cn('mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8', className)}>
      <div className="mb-6 flex items-center justify-between">
        <a href="/feed" className="text-sm font-medium text-accent">
          Back
        </a>
        <div className="text-sm text-text-tertiary">Profile setup</div>
      </div>
      <div className="mb-8 rounded-3xl border border-border-subtle bg-bg-surface px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">First-run setup</div>
            <p className="mt-1 text-sm text-text-secondary">
              Get into the app fast with just the identity needed to personalize your first session. You can build credibility and discovery signal after entry.
            </p>
          </div>
          <div className="text-sm font-medium text-accent">Everything beyond the basics can wait</div>
        </div>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {Array.from({ length: steps }, (_, index) => index + 1).map((dot) => (
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
