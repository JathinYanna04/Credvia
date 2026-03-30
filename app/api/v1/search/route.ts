import { handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';
import type { CommunitySummary, UserSummary } from '@/lib/types';

function toCommunitySummary(community: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
  post_count: number;
}): CommunitySummary {
  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description ?? '',
    icon: community.name
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    memberCount: community.member_count,
    postCount: community.post_count,
    accent: 'var(--accent)',
  };
}

function toUserSummary(profile: {
  user_id: string;
  username: string;
  full_name: string | null;
  headline: string | null;
  avatar_url: string | null;
  location: string | null;
  current_company: string | null;
}): UserSummary {
  return {
    id: profile.user_id,
    username: profile.username,
    fullName: profile.full_name ?? profile.username,
    headline: profile.headline ?? '',
    avatarUrl: profile.avatar_url ?? '',
    skills: [],
    location: profile.location ?? undefined,
    currentCompany: profile.current_company ?? undefined,
    reputation: [],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();

    if (query.length < 2) {
      return ok({ posts: [], communities: [], people: [] });
    }

    const pattern = `%${query}%`;
    const supabase = await createServerSupabaseClient();

    const [postsResult, startupIdeaMatches, communitiesResult, profilesResult] = await Promise.all([
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
        .from('communities')
        .select('id, name, slug, description, member_count, post_count')
        .eq('status', 'active')
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .order('member_count', { ascending: false })
        .limit(8),
      supabase
        .from('profiles')
        .select('user_id, username, full_name, headline, avatar_url, location, current_company')
        .or(`username.ilike.${pattern},full_name.ilike.${pattern},headline.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    if (startupIdeaMatches.error) {
      throw new Error(startupIdeaMatches.error.message);
    }

    if (communitiesResult.error) {
      throw new Error(communitiesResult.error.message);
    }

    if (profilesResult.error) {
      throw new Error(profilesResult.error.message);
    }

    const combinedPostIds = new Set([
      ...(postsResult.data ?? []).map((post) => post.id),
      ...(startupIdeaMatches.data ?? []).map((idea) => idea.post_id),
    ]);

    const hydratedPosts =
      combinedPostIds.size > 0
        ? await supabase
            .from('posts')
            .select('*')
            .in('id', [...combinedPostIds])
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(12)
        : { data: [], error: null };

    if (hydratedPosts.error) {
      throw new Error(hydratedPosts.error.message);
    }

    const posts = await toPostSummaries(supabase, hydratedPosts.data ?? []);
    const communities = (communitiesResult.data ?? []).map(toCommunitySummary);
    const people = (profilesResult.data ?? []).map(toUserSummary);

    return ok({ posts, communities, people });
  } catch (error) {
    return handleApiError(error);
  }
}
