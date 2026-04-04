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
    .limit(8);

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
    const [postsResult, startupIdeaMatches, peopleResult] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .or(`title.ilike.${pattern},body_md.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('startup_ideas')
        .select('post_id')
        .or(
          `problem.ilike.${pattern},target_audience.ilike.${pattern},solution.ilike.${pattern},market_category.ilike.${pattern}`,
        )
        .limit(12),
      supabase
        .from('profiles')
        .select('user_id, username, full_name, headline')
        .or(`username.ilike.${pattern},full_name.ilike.${pattern},headline.ilike.${pattern}`)
        .limit(8),
    ]);

    const postIds = new Set([
      ...(postsResult.data ?? []).map((post) => post.id),
      ...(startupIdeaMatches.data ?? []).map((idea) => idea.post_id),
    ]);

    if (postIds.size > 0) {
      const hydratedPosts = await supabase
        .from('posts')
        .select('*')
        .in('id', [...postIds])
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(12);

      posts = await toPostSummaries(supabase, hydratedPosts.data ?? []);
    }

    people = peopleResult.data ?? [];
  }

  const matchingCommunities = communities.filter((community) =>
    `${community.name} ${community.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-9">
      <header className="premium-soft-gradient rounded-[28px] border border-border-subtle px-6 py-6 shadow-sm sm:px-7 sm:py-7">
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          Discover communities first, then branch into the people and posts worth your attention.
        </p>
        <form action="/explore" className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="explore-query" className="sr-only">
            Search Credvia
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              id="explore-query"
              name="q"
              defaultValue={query}
              placeholder="Search communities, posts, startup ideas, and people"
              className="h-12 w-full rounded-2xl border border-border-subtle bg-bg-surface pl-11 pr-4 text-sm text-text-primary outline-none transition focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-medium text-white"
          >
            Search
          </button>
        </form>
      </header>

      {query.length >= 2 ? (
        <section className="space-y-9">
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Communities</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Join the spaces that match what you want to be known for.
              </p>
            </div>
            {matchingCommunities.length === 0 ? (
              <div className="surface-panel p-5 text-sm text-text-secondary">
                No communities matched &quot;{query}&quot;.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {matchingCommunities.map((community) => (
                  <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel premium-card-lift block p-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Community</div>
                    <h3 className="mt-3 text-lg font-semibold text-text-primary">{community.name}</h3>
                    <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                    <p className="mt-4 text-xs text-text-tertiary">{community.member_count} members</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Posts and Startup Ideas</h2>
              <p className="mt-1 text-sm text-text-secondary">Matching work and discussions.</p>
            </div>
            {posts.length === 0 ? (
              <div className="surface-panel p-5 text-sm text-text-secondary">
                No posts matched &quot;{query}&quot;.
              </div>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">People</h2>
              <p className="mt-1 text-sm text-text-secondary">Profiles matching your search.</p>
            </div>
            {people.length === 0 ? (
              <div className="surface-panel p-5 text-sm text-text-secondary">
                No people matched &quot;{query}&quot;.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {people.map((person) => (
                  <Link key={person.user_id} href={`/u/${person.username}`} className="surface-panel premium-card-lift block p-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Person</div>
                    <h3 className="mt-3 text-lg font-semibold text-text-primary">
                      {person.full_name ?? person.username}
                    </h3>
                    <p className="mt-2 text-sm text-text-secondary">{person.headline ?? 'Credvia member'}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/career" className="surface-panel card-lift block p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Career hub</div>
              <h2 className="mt-3 text-xl font-semibold text-text-primary">Build credibility, then grow your career</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Upload your resume, run Career Match, and browse startup roles in one flow.
              </p>
              <div className="mt-4 inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                Open Career Hub
              </div>
            </Link>
            <div className="surface-panel p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Quick paths</div>
              <div className="mt-4 space-y-2 text-sm">
                <Link href="/resume" className="flex items-center justify-between rounded-xl border border-border-subtle px-4 py-3 text-text-secondary hover:border-border-default hover:text-text-primary">
                  Resume
                  <span className="text-xs text-text-tertiary">Upload or analyze</span>
                </Link>
                <Link href="/jobs" className="flex items-center justify-between rounded-xl border border-border-subtle px-4 py-3 text-text-secondary hover:border-border-default hover:text-text-primary">
                  Job search
                  <span className="text-xs text-text-tertiary">Browse roles</span>
                </Link>
                <Link href="/career-match" className="flex items-center justify-between rounded-xl border border-border-subtle px-4 py-3 text-text-secondary hover:border-border-default hover:text-text-primary">
                  Career Match
                  <span className="text-xs text-text-tertiary">See ranked fits</span>
                </Link>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Popular communities</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Start with one or two communities, then let Credvia&apos;s feed do the rest.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {communities.map((community) => (
              <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel premium-card-lift block p-5">
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
