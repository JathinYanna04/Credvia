import type { PropsWithChildren } from 'react';
import { PostHogIdentify } from '@/components/analytics/PostHogIdentify';
import { AppShell } from '@/components/layout/AppShell';
import { ensureProfileRecord } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AuthenticatedLayout({ children }: PropsWithChildren) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await ensureProfileRecord(supabase, user);
  }

  return (
    <>
      <PostHogIdentify distinctId={user?.id ?? null} />
      <AppShell>{children}</AppShell>
    </>
  );
}
