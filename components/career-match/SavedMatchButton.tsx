'use client';

import { Bookmark, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface SavedMatchButtonProps {
  matchId: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}

export function SavedMatchButton({ matchId, saved, onSavedChange }: SavedMatchButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={saved ? 'default' : 'secondary'}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          setAuthExpired(false);

          try {
            const response = await fetch(`/api/v1/matches/${matchId}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ saved: !saved }),
            });
            const payload = (await response.json()) as {
              data?: { saved: boolean };
              error?: { message?: string };
            };

            if (response.status === 401) {
              setAuthExpired(true);
              return;
            }

            if (!response.ok || !payload.data) {
              throw new Error(payload.error?.message ?? 'Could not update saved matches.');
            }

            onSavedChange(payload.data.saved);
          } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Could not update saved matches.');
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
        {saved ? 'Saved' : 'Save match'}
      </Button>
      {authExpired ? (
        <p className="text-xs text-danger">Your session expired. Sign in again to save matches.</p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
