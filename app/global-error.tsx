'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the error boundary lightweight in dev/runtime paths.
    void error;
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-bg-base px-4 text-text-primary">
        <div className="surface-panel max-w-md p-6">
          <h1 className="text-2xl font-semibold">Application error</h1>
          <p className="mt-3 text-sm text-text-secondary">
            Credvia captured the failure and blocked the broken render path.
          </p>
          <div className="mt-5">
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
