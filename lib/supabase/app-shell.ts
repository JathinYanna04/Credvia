import type { UserSummary } from '@/lib/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AppShellData {
  currentUser: UserSummary | null;
  onboardingComplete: boolean;
  joinedCommunities: Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
  }>;
  unreadNotifications: number;
}

interface JoinedCommunityRow {
  id: string;
  name: string;
  slug: string;
}

export async function getAppShellData(): Promise<AppShellData> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      currentUser: null,
      onboardingComplete: true,
      joinedCommunities: [],
      unreadNotifications: 0,
    };
  }

  const [profileResult, membershipsResult, unreadResult, reputationResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('community_memberships')
      .select('community_id, communities(id, name, slug)')
      .eq('user_id', user.id)
      .limit(8),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
    supabase
      .from('community_reputation')
      .select('community_id, score')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(3),
  ]);

  const profile = profileResult.data;
  const reputationCommunityIds = (reputationResult.data ?? []).map((entry) => entry.community_id);
  const communitiesForReputation = reputationCommunityIds.length
    ? await supabase
        .from('communities')
        .select('id, name, slug')
        .in('id', reputationCommunityIds)
    : { data: [], error: null };
  const communitiesMap = new Map(
    (communitiesForReputation.data ?? []).map((community) => [community.id, community]),
  );
  const currentUser: UserSummary = {
    id: user.id,
    username: profile?.username ?? `user_${user.id.slice(0, 8)}`,
    fullName: profile?.full_name ?? profile?.username ?? 'Credvia User',
    headline: profile?.headline ?? '',
    avatarUrl: profile?.avatar_url ?? '',
    skills: [],
    location: profile?.location ?? undefined,
    currentCompany: profile?.current_company ?? undefined,
    reputation: (reputationResult.data ?? [])
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
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  };

  const joinedCommunities = ((membershipsResult.data ?? []) as Array<{
    communities: JoinedCommunityRow | JoinedCommunityRow[] | null;
  }>)
    .map((membership) =>
      Array.isArray(membership.communities)
        ? membership.communities[0] ?? null
        : membership.communities,
    )
    .filter((community): community is JoinedCommunityRow => Boolean(community))
    .map((community) => ({
      id: community.id,
      name: community.name,
      slug: community.slug,
      icon: community.name
        .split(' ')
        .map((chunk: string) => chunk[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    }));

  return {
    currentUser,
    onboardingComplete: profile?.onboarding_complete ?? false,
    joinedCommunities,
    unreadNotifications: unreadResult.count ?? 0,
  };
}
