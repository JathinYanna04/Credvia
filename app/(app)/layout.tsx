import type { PropsWithChildren } from "react";
import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { AppShell } from "@/components/layout/AppShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: PropsWithChildren) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <PostHogIdentify distinctId={user?.id ?? null} />
      <AppShell>{children}</AppShell>
    </>
  );
}
