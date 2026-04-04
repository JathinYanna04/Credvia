import { MarketingLandingClient } from '@/components/marketing/MarketingLandingClient';
import type {
  LandingCommunitySummary,
  PublicPostSummary,
} from '@/components/marketing/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient();
  const [communitiesResult, postsResult] = await Promise.all([
    supabase
      .from('communities')
      .select('id, name, slug, description, member_count')
      .eq('status', 'active')
      .order('member_count', { ascending: false })
      .limit(6),
    supabase
      .from('posts')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(2),
  ]);

  const communities: LandingCommunitySummary[] = (communitiesResult.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description,
    member_count: item.member_count ?? 0,
  }));

  const featuredPosts: PublicPostSummary[] = (await toPostSummaries(
    supabase,
    postsResult.data ?? [],
  )).map((post) => ({
    id: post.id,
    title: post.title,
    body: post.body,
    community: {
      name: post.community.name,
    },
  }));

  return (
    <MarketingLandingClient
      communities={communities}
      featuredPosts={featuredPosts}
    />
  );
}
