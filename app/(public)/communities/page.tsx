import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function PublicCommunitiesPage() {
  const supabase = await createServerSupabaseClient();
  const communitiesResult = await supabase
    .from('communities')
    .select('id, name, slug, description, member_count')
    .eq('status', 'active')
    .order('member_count', { ascending: false });

  const communities = communitiesResult.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold">Communities</h1>
      <p className="mt-3 max-w-2xl text-sm text-text-secondary">
        Focused spaces for students, builders, and early-career professionals.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {communities.map((community) => (
          <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel card-lift p-6">
            <h2 className="text-xl font-semibold">{community.name}</h2>
            <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
            <p className="mt-5 text-xs uppercase tracking-[0.16em] text-text-tertiary">
              {community.member_count} members
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
