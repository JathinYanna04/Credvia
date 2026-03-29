'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function IdeaDetailError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-3xl border border-border-subtle bg-bg-surface p-6">
      <h1 className="text-2xl font-semibold text-text-primary">Startup idea unavailable</h1>
      <p className="text-sm text-text-secondary">
        Credvia hit a runtime problem while loading this idea.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/ideas">Back to ideas</Link>
        </Button>
      </div>
    </div>
  );
}
