'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProfileCompletionState } from '@/lib/profile-completion';

const CATEGORY_LABELS = {
  identity: 'Identity',
  credibility: 'Credibility',
  discovery: 'Discovery',
  contribution: 'Contribution',
} as const;

export function ProfileCompletionChecklist({
  title = 'Keep building your profile',
  description = 'You are already inside. Add depth when it helps, not before.',
  completion,
  compact = false,
}: {
  title?: string;
  description?: string;
  completion: ProfileCompletionState;
  compact?: boolean;
}) {
  const remaining = completion.items.filter((item) => !item.complete);

  if (remaining.length === 0) {
    return null;
  }

  return (
    <section className="surface-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
            Profile completion
          </div>
          <h2 className="mt-2 text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        <Badge variant="secondary">{completion.progress}% complete</Badge>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-base">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${completion.progress}%` }}
        />
      </div>

      <div className="mt-5 space-y-3">
        {remaining.slice(0, compact ? 3 : 5).map((item) => (
          <div
            key={item.id}
            className="rounded-[22px] border border-border-subtle bg-bg-base px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                  {CATEGORY_LABELS[item.category]}
                </div>
                <div className="mt-1 text-sm font-medium text-text-primary">{item.title}</div>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{item.description}</p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={item.href}>Add</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
