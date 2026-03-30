import type { PropsWithChildren } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ensureProfileRecord } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AuthenticatedLayout({ children }: PropsWithChildren) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await ensureProfileRecord(supabase, user);

    if (!profile.onboarding_complete) {
      redirect('/onboarding/interests');
    }
  }

  return <AppShell>{children}</AppShell>;
}
