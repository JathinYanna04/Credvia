import { notFound } from 'next/navigation';
import { PostCard } from '@/components/feed/PostCard';
import { CommunityHeader } from '@/components/community/CommunityHeader';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';

export default async function CommunityPage({ params }: { params: { slug: string } }) {
  const supabase = await createServerSupabaseClient();
  const communityResult = await supabase
    .from('communities')
    .select('*')
    .eq('slug', params.slug)
    .eq('status', 'active')
    .maybeSingle();

  if (communityResult.error || !communityResult.data) {
    notFound();
  }

  const communityRow = communityResult.data;
  const membershipResult = await supabase.auth.getUser();
  const userId = membershipResult.data.user?.id ?? null;
  const joinedResult = userId
    ? await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', userId)
        .eq('community_id', communityRow.id)
        .maybeSingle()
    : { data: null, error: null };

  const postsResult = await supabase
    .from('posts')
    .select('*')
    .eq('community_id', communityRow.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  const posts = await toPostSummaries(supabase, postsResult.data ?? []);
  const community = {
    id: communityRow.id,
    name: communityRow.name,
    slug: communityRow.slug,
    description: communityRow.description ?? '',
    icon: communityRow.name
      .split(' ')
      .map((chunk: string) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    memberCount: communityRow.member_count,
    postCount: communityRow.post_count,
    accent: 'var(--accent)',
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CommunityHeader community={community} initialJoined={Boolean(joinedResult.data)} />
      <div className="flex flex-wrap gap-3 border-b border-border-subtle pb-3 text-sm text-text-secondary">
        <span className="text-accent">Feed</span>
        <span>About</span>
        <span>Rules</span>
        <span>Top Contributors</span>
      </div>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
