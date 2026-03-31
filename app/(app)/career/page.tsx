import { redirect } from 'next/navigation';
import { CareerHubPage } from '@/components/career-match/CareerHubPage';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CareerPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <CareerHubPage />;
}
