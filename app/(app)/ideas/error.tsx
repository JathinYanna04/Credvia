'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function IdeasError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-3xl border border-border-subtle bg-bg-surface p-6">
      <h1 className="text-2xl font-semibold text-text-primary">Ideas are unavailable</h1>
      <p className="text-sm text-text-secondary">
        Credvia could not load the startup ideas module right now.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/feed">Back to feed</Link>
        </Button>
      </div>
    </div>
  );
}
