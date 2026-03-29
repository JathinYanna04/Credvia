import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { CommentSummary, CommunitySummary, PostSummary, UserSummary } from '@/lib/types';
import { computeIdeaValidationScore } from '@/lib/utils/idea-score';

export type TypedSupabaseClient = SupabaseClient;

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type CommunityRow = Database['public']['Tables']['communities']['Row'];
type PostRow = Database['public']['Tables']['posts']['Row'];
type CommentRow = Database['public']['Tables']['comments']['Row'];
type CommunityReputationRow = Database['public']['Tables']['community_reputation']['Row'];
type StartupIdeaRow = Database['public']['Tables']['startup_ideas']['Row'];
type StartupIdeaStage = NonNullable<PostSummary['startupIdea']>['stage'];

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function getProfilesByUserIds(
  supabase: TypedSupabaseClient,
  userIds: string[],
) {
  const ids = unique(userIds);

  if (ids.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
  );
}

export async function getCommunitiesByIds(
  supabase: TypedSupabaseClient,
  communityIds: string[],
) {
  const ids = unique(communityIds);

  if (ids.length === 0) {
    return new Map<string, CommunityRow>();
  }

  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .in('id', ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as CommunityRow[]).map((community) => [community.id, community]),
  );
}

export async function getCommunityReputation(
  supabase: TypedSupabaseClient,
  userIds: string[],
  communityIds: string[],
) {
  const resolvedUserIds = unique(userIds);
  const resolvedCommunityIds = unique(communityIds);

  if (resolvedUserIds.length === 0 || resolvedCommunityIds.length === 0) {
    return new Map<string, CommunityReputationRow>();
  }

  const { data, error } = await supabase
    .from('community_reputation')
    .select('*')
    .in('user_id', resolvedUserIds)
    .in('community_id', resolvedCommunityIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as CommunityReputationRow[]).map((entry) => [
      `${entry.user_id}:${entry.community_id}`,
      entry,
    ]),
  );
}

export async function getStartupIdeasByPostIds(
  supabase: TypedSupabaseClient,
  postIds: string[],
) {
  const ids = unique(postIds);

  if (ids.length === 0) {
    return new Map<string, StartupIdeaRow>();
  }

  const { data, error } = await supabase
    .from('startup_ideas')
    .select('*')
    .in('post_id', ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as StartupIdeaRow[]).map((idea) => [idea.post_id, idea]),
  );
}

export async function getUniqueCommenterCounts(
  supabase: TypedSupabaseClient,
  postIds: string[],
) {
  const ids = unique(postIds);

  if (ids.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await supabase
    .from('comments')
    .select('post_id, author_id')
    .in('post_id', ids)
    .eq('status', 'published');

  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, Set<string>>();

  (data ?? []).forEach((comment) => {
    if (!counts.has(comment.post_id)) {
      counts.set(comment.post_id, new Set<string>());
    }

    counts.get(comment.post_id)?.add(comment.author_id);
  });

  return new Map(
    [...counts.entries()].map(([postId, authorIds]) => [postId, authorIds.size]),
  );
}

function toCommunitySummary(community: CommunityRow): CommunitySummary {
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

function toUserSummary(
  userId: string,
  profile: ProfileRow | undefined,
  community: CommunityRow | undefined,
  reputationMap: Map<string, CommunityReputationRow>,
): UserSummary {
  const repKey = community ? `${userId}:${community.id}` : '';
  const rep = community ? reputationMap.get(repKey) : null;

  return {
    id: userId,
    username: profile?.username ?? `user_${userId.slice(0, 8)}`,
    fullName: profile?.full_name ?? profile?.username ?? 'Credvia User',
    headline: profile?.headline ?? '',
    avatarUrl: profile?.avatar_url ?? '',
    skills: [],
    location: profile?.location ?? undefined,
    currentCompany: profile?.current_company ?? undefined,
    reputation: community
      ? [
          {
            communityId: community.id,
            communityName: community.name,
            communitySlug: community.slug,
            score: rep?.score ?? 0,
          },
        ]
      : [],
  };
}

export async function toPostSummaries(
  supabase: TypedSupabaseClient,
  posts: PostRow[],
): Promise<PostSummary[]> {
  const profiles = await getProfilesByUserIds(
    supabase,
    posts.map((post) => post.author_id),
  );
  const communities = await getCommunitiesByIds(
    supabase,
    posts.map((post) => post.community_id),
  );
  const communityRep = await getCommunityReputation(
    supabase,
    posts.map((post) => post.author_id),
    posts.map((post) => post.community_id),
  );
  const startupIdeas = await getStartupIdeasByPostIds(
    supabase,
    posts.map((post) => post.id),
  );
  const uniqueCommenterCounts = await getUniqueCommenterCounts(
    supabase,
    posts.map((post) => post.id),
  );

  return posts.map((post) => {
    const community = communities.get(post.community_id);
    const authorProfile = profiles.get(post.author_id);
    const startupIdea = startupIdeas.get(post.id);
    const uniqueCommenters = uniqueCommenterCounts.get(post.id) ?? 0;

    return {
      id: post.id,
      title: post.title,
      body: post.body_md ?? '',
      createdAt: post.created_at,
      postType: post.post_type as PostSummary['postType'],
      voteScore: post.vote_score,
      commentCount: post.comment_count,
      saveCount: post.save_count,
      author: toUserSummary(post.author_id, authorProfile, community, communityRep),
      community: community ? toCommunitySummary(community) : {
        id: post.community_id,
        name: 'Unknown Community',
        slug: 'unknown',
        description: '',
        icon: 'UC',
        memberCount: 0,
        postCount: 0,
        accent: 'var(--accent)',
      },
      tags: [],
      unanswered: post.post_type === 'question' && post.comment_count === 0,
      externalUrl: post.external_url ?? undefined,
      startupIdea: startupIdea
        ? {
            problem: startupIdea.problem,
            targetAudience: startupIdea.target_audience,
            solution: startupIdea.solution,
            marketCategory: startupIdea.market_category,
            stage: startupIdea.stage as StartupIdeaStage,
            monetizationModel: startupIdea.monetization_model ?? undefined,
            validationScore: computeIdeaValidationScore({
              voteScore: post.vote_score,
              commentCount: post.comment_count,
              saveCount: post.save_count,
              uniqueCommenters,
              createdAt: post.created_at,
            }),
            uniqueCommenters,
          }
        : undefined,
    };
  });
}

export async function toCommentSummaries(
  supabase: TypedSupabaseClient,
  comments: CommentRow[],
  communityId: string,
): Promise<CommentSummary[]> {
  const profiles = await getProfilesByUserIds(
    supabase,
    comments.map((comment) => comment.author_id),
  );
  const communities = await getCommunitiesByIds(supabase, [communityId]);
  const reputation = await getCommunityReputation(
    supabase,
    comments.map((comment) => comment.author_id),
    [communityId],
  );
  const community = communities.get(communityId);

  const commentMap = new Map<string, CommentSummary & { parentId?: string }>();

  comments.forEach((comment) => {
    commentMap.set(comment.id, {
      id: comment.id,
      author: toUserSummary(
        comment.author_id,
        profiles.get(comment.author_id),
        community,
        reputation,
      ),
      body: comment.body_md,
      createdAt: comment.created_at,
      voteScore: comment.vote_score,
      isBestAnswer: comment.is_best_answer,
      replies: [],
      parentId: comment.parent_comment_id ?? undefined,
    });
  });

  const roots: (CommentSummary & { parentId?: string })[] = [];

  commentMap.forEach((comment) => {
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      parent?.replies?.push(comment);
      return;
    }

    roots.push(comment);
  });

  return roots.map(({ parentId: _parentId, ...comment }) => comment);
}
