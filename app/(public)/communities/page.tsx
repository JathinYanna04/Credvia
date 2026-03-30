import Link from 'next/link';
import { JoinButton } from '@/components/community/JoinButton';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function PublicCommunitiesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const communitiesResult = await supabase
    .from('communities')
    .select('id, name, slug, description, member_count')
    .eq('status', 'active')
    .order('member_count', { ascending: false });

  const communities = communitiesResult.data ?? [];
  const membershipsResult = user
    ? await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', user.id)
    : { data: [], error: null };
  const joinedIds = new Set((membershipsResult.data ?? []).map((row) => row.community_id));
  const joinedCommunities = communities.filter((community) => joinedIds.has(community.id));
  const suggestedCommunities = communities.filter((community) => !joinedIds.has(community.id));

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold">Communities</h1>
        <p className="max-w-2xl text-sm text-text-secondary">
          Join focused spaces, shape your feed, and earn reputation where your answers actually matter.
        </p>
      </header>

      {user ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">My communities</h2>
            <p className="mt-1 text-sm text-text-secondary">These are the spaces currently shaping your home feed.</p>
          </div>
          {joinedCommunities.length === 0 ? (
            <div className="surface-panel p-5 text-sm text-text-secondary">
              You have not joined any communities yet. Start with one that matches your strongest interests.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {joinedCommunities.map((community) => (
                <div key={community.id} className="surface-panel card-lift p-6">
                  <Link href={`/c/${community.slug}`} className="block">
                    <h2 className="text-xl font-semibold">{community.name}</h2>
                    <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                  </Link>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                      {community.member_count} members
                    </p>
                    <JoinButton communityId={community.id} initialJoined />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{user ? 'Explore more communities' : 'Explore communities'}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Find places to ask sharper questions, publish better work, and build visible credibility.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(user ? suggestedCommunities : communities).map((community) => (
            <div key={community.id} className="surface-panel card-lift p-6">
              <Link href={`/c/${community.slug}`} className="block">
                <h2 className="text-xl font-semibold">{community.name}</h2>
                <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
              </Link>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  {community.member_count} members
                </p>
                <JoinButton communityId={community.id} initialJoined={joinedIds.has(community.id)} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
