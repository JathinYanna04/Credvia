import Link from 'next/link';
import { Search } from 'lucide-react';
import { PostCard } from '@/components/feed/PostCard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const query = (searchParams?.q ?? '').trim();
  const supabase = await createServerSupabaseClient();

  const communitiesResult = await supabase
    .from('communities')
    .select('id, name, slug, description, member_count, post_count')
    .eq('status', 'active')
    .order('member_count', { ascending: false })
    .limit(6);

  const communities = communitiesResult.data ?? [];

  let posts = [] as Awaited<ReturnType<typeof toPostSummaries>>;
  let people = [] as Array<{
    user_id: string;
    username: string;
    full_name: string | null;
    headline: string | null;
  }>;

  if (query.length >= 2) {
    const pattern = `%${query}%`;
    const [postsResult, peopleResult] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .or(`title.ilike.${pattern},body_md.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('profiles')
        .select('user_id, username, full_name, headline')
        .or(`username.ilike.${pattern},full_name.ilike.${pattern},headline.ilike.${pattern}`)
        .limit(8),
    ]);

    posts = await toPostSummaries(supabase, postsResult.data ?? []);
    people = peopleResult.data ?? [];
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="max-w-2xl text-sm text-text-secondary">
          Find communities, people, posts, and startup ideas worth your attention.
        </p>
        <form action="/explore" className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="explore-query" className="sr-only">
            Search Credvia
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              id="explore-query"
              name="q"
              defaultValue={query}
              placeholder="Search posts, startup ideas, communities, and people"
              className="h-12 w-full rounded-2xl border border-border-subtle bg-bg-surface pl-11 pr-4 text-sm text-text-primary outline-none transition focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-medium text-bg-base"
          >
            Search
          </button>
        </form>
      </header>

      {query.length >= 2 ? (
        <section className="space-y-8">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Posts and Startup Ideas</h2>
              <p className="mt-1 text-sm text-text-secondary">Matching work and discussions.</p>
            </div>
            {posts.length === 0 ? (
              <div className="surface-panel p-5 text-sm text-text-secondary">
                No posts matched “{query}”.
              </div>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Communities</h2>
                <p className="mt-1 text-sm text-text-secondary">Relevant spaces to join.</p>
              </div>
              {(communities.filter((community) =>
                `${community.name} ${community.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
              )).length === 0 ? (
                <div className="surface-panel p-5 text-sm text-text-secondary">
                  No communities matched “{query}”.
                </div>
              ) : (
                communities
                  .filter((community) =>
                    `${community.name} ${community.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((community) => (
                    <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel block p-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Community</div>
                      <h3 className="mt-3 text-lg font-semibold text-text-primary">{community.name}</h3>
                      <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                    </Link>
                  ))
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">People</h2>
                <p className="mt-1 text-sm text-text-secondary">Profiles matching your search.</p>
              </div>
              {people.length === 0 ? (
                <div className="surface-panel p-5 text-sm text-text-secondary">
                  No people matched “{query}”.
                </div>
              ) : (
                people.map((person) => (
                  <Link key={person.user_id} href={`/u/${person.username}`} className="surface-panel block p-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Person</div>
                    <h3 className="mt-3 text-lg font-semibold text-text-primary">
                      {person.full_name ?? person.username}
                    </h3>
                    <p className="mt-2 text-sm text-text-secondary">{person.headline ?? 'Credvia member'}</p>
                  </Link>
                ))
              )}
            </section>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Popular communities</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Join communities to shape your feed and startup-idea discovery.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {communities.map((community) => (
              <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel block p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Community</div>
                <h3 className="mt-3 text-lg font-semibold text-text-primary">{community.name}</h3>
                <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                <p className="mt-4 text-xs text-text-tertiary">{community.member_count} members</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
