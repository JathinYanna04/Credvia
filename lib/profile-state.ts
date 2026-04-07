import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { computePersonaCompletionScore, normalizePersonaSlug } from '@/lib/personas';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export const PROFILE_SELECT =
  'user_id, username, full_name, headline, bio, avatar_url, location, website, current_company, education, primary_persona, secondary_personas, profile_intent, open_to, expertise_tags, interest_tags, contribution_score, credibility_score, helpfulness_score, expertise_score, community_score, persona_completion_score, open_for_opportunities, open_for_mentorship, open_for_hiring, onboarding_version, contribution_profile, trust_profile, behavioral_signals, growth_trajectory, identity_confidence_score, consistency_score, depth_score, impact_score, signal_to_noise_ratio, domain_authority_score, metadata, profile_visibility, onboarding_complete, onboarding_completed_at, created_at, updated_at';

export function hasBasicOnboardingIdentity(
  profile: Pick<ProfileRow, 'primary_persona' | 'username' | 'full_name'>,
) {
  return Boolean(
    normalizePersonaSlug(profile.primary_persona) &&
      (profile.username ?? '').trim().length >= 3 &&
      (profile.full_name ?? '').trim().length >= 2,
  );
}

export function requiresPersonaOnboarding(
  profile: Pick<ProfileRow, 'onboarding_complete' | 'primary_persona' | 'username' | 'full_name'> &
    Partial<Pick<ProfileRow, 'onboarding_version' | 'persona_completion_score'>>,
) {
  return !profile.onboarding_complete || !hasBasicOnboardingIdentity(profile);
}

export function getPostAuthRedirectPath(
  profile: Pick<ProfileRow, 'onboarding_complete' | 'primary_persona' | 'username' | 'full_name'> &
    Partial<Pick<ProfileRow, 'onboarding_version' | 'persona_completion_score'>>,
) {
  return requiresPersonaOnboarding(profile) ? '/onboarding' : '/feed';
}

export function inferPersonaFromUser(user: Pick<User, 'user_metadata'>) {
  return normalizePersonaSlug(user.user_metadata?.account_type);
}

export function buildProfileCompletionState(input: {
  profile: Pick<
    ProfileRow,
    | 'primary_persona'
    | 'full_name'
    | 'headline'
    | 'bio'
    | 'secondary_personas'
    | 'profile_intent'
    | 'open_to'
    | 'interest_tags'
    | 'expertise_tags'
  >;
  joinedCommunityIds?: string[] | null;
  selectedSkillIds?: string[] | null;
  detailRecord?: Record<string, unknown> | null;
}) {
  return computePersonaCompletionScore({
    primaryPersona: normalizePersonaSlug(input.profile.primary_persona),
    fullName: input.profile.full_name,
    headline: input.profile.headline,
    bio: input.profile.bio,
    secondaryPersonas: input.profile.secondary_personas,
    profileIntent: input.profile.profile_intent,
    openTo: input.profile.open_to,
    interestTags: input.profile.interest_tags,
    expertiseTags: input.profile.expertise_tags,
    joinedCommunityIds: input.joinedCommunityIds,
    selectedSkillIds: input.selectedSkillIds,
    detailRecord: input.detailRecord ?? undefined,
  });
}
