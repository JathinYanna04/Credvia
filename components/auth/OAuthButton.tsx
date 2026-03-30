'use client';

import { Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import posthog from '@/lib/analytics/posthog-client';
import { createClient } from '@/lib/supabase/client';

export interface OAuthButtonProps {
  mode: 'login' | 'signup';
  onError?: (message: string) => void;
}

export function OAuthButton({ mode, onError }: OAuthButtonProps) {
  const onClick = async () => {
    const supabase = createClient();
    posthog.capture('oauth_google_started', { mode });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      posthog.capture('oauth_google_failed', {
        mode,
        message: error.message,
      });
      onError?.(error.message);
    }
  };

  return (
    <Button type="button" variant="secondary" className="w-full justify-center" onClick={onClick}>
      <Chrome className="h-4 w-4" />
      {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
    </Button>
  );
}
