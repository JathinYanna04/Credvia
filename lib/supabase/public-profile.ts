import { notFound } from 'next/navigation';
import type { CommentSummary, PostSummary, UserSummary } from '@/lib/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toCommentSummaries, toPostSummaries } from '@/lib/supabase/query-helpers';

export interface PublicProfileBundle {
  user: UserSummary;
  posts: PostSummary[];
  comments: CommentSummary[];
}

export async function getPublicProfileBundle(username: string): Promise<PublicProfileBundle> {
  const supabase = await createServerSupabaseClient();
  const profileResult = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    notFound();
  }

  const profile = profileResult.data;
  const [skillsResult, reputationResult, postsResult, commentsResult] = await Promise.all([
    supabase
      .from('user_skills')
      .select('skills(name)')
      .eq('user_id', profile.user_id),
    supabase
      .from('community_reputation')
      .select('community_id, score')
      .eq('user_id', profile.user_id)
      .order('score', { ascending: false })
      .limit(5),
    supabase
      .from('posts')
      .select('*')
      .eq('author_id', profile.user_id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('comments')
      .select('*')
      .eq('author_id', profile.user_id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const communityIds = (reputationResult.data ?? []).map((entry) => entry.community_id);
  const communitiesResult = communityIds.length
    ? await supabase
        .from('communities')
        .select('id, name, slug')
        .in('id', communityIds)
    : { data: [], error: null };

  const communitiesMap = new Map(
    (communitiesResult.data ?? []).map((community) => [community.id, community]),
  );
  const topReputation = (reputationResult.data ?? [])
    .map((entry) => {
      const community = communitiesMap.get(entry.community_id);
      if (!community) {
        return null;
      }

      return {
        communityId: entry.community_id,
        communityName: community.name,
        communitySlug: community.slug,
        score: entry.score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const posts = await toPostSummaries(supabase, postsResult.data ?? []);
  const comments = commentsResult.error
    ? []
    : await toCommentSummaries(
        supabase,
        commentsResult.data ?? [],
        postsResult.data?.[0]?.community_id ?? communityIds[0] ?? '',
      );

  return {
    user: {
      id: profile.user_id,
      username: profile.username,
      fullName: profile.full_name ?? profile.username,
      headline: profile.headline ?? '',
      avatarUrl: profile.avatar_url ?? '',
      skills: (skillsResult.data ?? [])
        .map((row) => (row.skills as { name?: string } | null)?.name)
        .filter((value): value is string => Boolean(value)),
      location: profile.location ?? undefined,
      currentCompany: profile.current_company ?? undefined,
      reputation: topReputation,
    },
    posts,
    comments,
  };
}
