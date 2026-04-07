import {
  getCredibilityBadge,
  getPersonaDetails,
  normalizePersonaSlug,
  OPEN_TO_VALUES,
  PROFILE_INTENT_VALUES,
} from '@/lib/personas';
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
      .select('skill_id')
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
  const skillIds = (skillsResult.data ?? []).map((entry) => entry.skill_id);
  const profileSkillsResult = skillIds.length
    ? await supabase.from('skills').select('id, name').in('id', skillIds)
    : { data: [], error: null };
  const communitiesResult = communityIds.length
    ? await supabase
        .from('communities')
        .select('id, name, slug')
        .in('id', communityIds)
    : { data: [], error: null };

  if (profileSkillsResult.error) {
    throw new Error(profileSkillsResult.error.message);
  }

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
      primaryPersona: normalizePersonaSlug(profile.primary_persona) ?? undefined,
      secondaryPersonas: (profile.secondary_personas ?? [])
        .map((persona) => normalizePersonaSlug(persona))
        .filter((persona): persona is NonNullable<typeof persona> => Boolean(persona)),
      profileIntent: (profile.profile_intent ?? []).filter((item): item is (typeof PROFILE_INTENT_VALUES)[number] =>
        PROFILE_INTENT_VALUES.includes(item as (typeof PROFILE_INTENT_VALUES)[number]),
      ),
      openTo: (profile.open_to ?? []).filter((item): item is (typeof OPEN_TO_VALUES)[number] =>
        OPEN_TO_VALUES.includes(item as (typeof OPEN_TO_VALUES)[number]),
      ),
      expertiseTags: profile.expertise_tags ?? [],
      interestTags: profile.interest_tags ?? [],
      personaDetails: getPersonaDetails(
        profile.metadata ?? null,
        normalizePersonaSlug(profile.primary_persona),
      ),
      skills: (profileSkillsResult.data ?? [])
        .map((row) => row.name)
        .filter((value): value is string => Boolean(value)),
      location: profile.location ?? undefined,
      website: profile.website ?? undefined,
      currentCompany: profile.current_company ?? undefined,
      scoreSummary: {
        contribution_score: profile.contribution_score ?? 0,
        credibility_score: profile.credibility_score ?? 0,
        helpfulness_score: profile.helpfulness_score ?? 0,
        expertise_score: profile.expertise_score ?? 0,
        community_score: profile.community_score ?? 0,
        persona_completion_score: profile.persona_completion_score ?? 0,
      },
      badge: getCredibilityBadge({
        contributionScore: profile.contribution_score,
        credibilityScore: profile.credibility_score,
        helpfulnessScore: profile.helpfulness_score,
      }),
      contributionProfile:
        profile.contribution_profile && typeof profile.contribution_profile === 'object'
          ? (profile.contribution_profile as Record<string, unknown>)
          : undefined,
      trustProfile:
        profile.trust_profile && typeof profile.trust_profile === 'object'
          ? (profile.trust_profile as Record<string, unknown>)
          : undefined,
      growthTrajectory:
        profile.growth_trajectory && typeof profile.growth_trajectory === 'object'
          ? (profile.growth_trajectory as Record<string, unknown>)
          : undefined,
      behavioralSignals:
        profile.behavioral_signals && typeof profile.behavioral_signals === 'object'
          ? (profile.behavioral_signals as Record<string, unknown>)
          : undefined,
      reputation: topReputation,
    },
    posts,
    comments,
  };
}
