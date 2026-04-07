import type { PropsWithChildren } from "react";
import { redirect } from 'next/navigation';
import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { AppShell } from "@/components/layout/AppShell";
import { requiresPersonaOnboarding } from '@/lib/profile-state';
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: PropsWithChildren) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profileResult = await supabase
      .from('profiles')
      .select('primary_persona, onboarding_complete, username, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profileResult.error && (!profileResult.data || requiresPersonaOnboarding(profileResult.data))) {
      redirect('/onboarding');
    }
  }

  return (
    <>
      <PostHogIdentify distinctId={user?.id ?? null} />
      <AppShell>{children}</AppShell>
    </>
  );
}
