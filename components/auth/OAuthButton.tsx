'use client';

import { Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export interface OAuthButtonProps {
  mode: 'login' | 'signup';
}

export function OAuthButton({ mode }: OAuthButtonProps) {
  const onClick = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <Button type="button" variant="secondary" className="w-full justify-center" onClick={onClick}>
      <Chrome className="h-4 w-4" />
      {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
    </Button>
  );
}
