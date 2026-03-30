'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export interface LogoutButtonProps {
  className?: string;
  compact?: boolean;
}

export function LogoutButton({ className, compact = false }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={compact ? 'ghost' : 'secondary'}
        className={className}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);

          try {
            const apiResponse = await fetch('/api/v1/auth/logout', { method: 'POST' });

            if (!apiResponse.ok && apiResponse.status !== 401) {
              const payload = (await apiResponse.json().catch(() => null)) as { error?: { message?: string } } | null;
              throw new Error(payload?.error?.message ?? 'Could not sign out.');
            }

            void createClient().auth.signOut({ scope: 'local' }).catch(() => undefined);

            window.location.assign('/login');
          } catch (signOutError) {
            setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out.');
            setLoading(false);
          }
        }}
      >
        <LogOut className="h-4 w-4" />
        {loading ? 'Signing out...' : 'Sign out'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
