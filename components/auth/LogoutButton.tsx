'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={compact ? 'ghost' : 'secondary'}
      className={className}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch('/api/v1/auth/logout', { method: 'POST' });
        await createClient().auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      {loading ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}
