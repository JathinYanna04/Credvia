import { computeBehavioralSignals, computeContributionProfile, computeGrowthTrajectory, computeTrustProfile } from '@/lib/intelligence/reputation';
import type { Database } from '@/lib/supabase/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ContributionStatsRow = Database['public']['Tables']['user_contribution_stats']['Row'];
type TrustEdgeRow = Database['public']['Tables']['trust_edges']['Row'];
type EndorsementRow = Database['public']['Tables']['endorsement_graph']['Row'];
type FeedSignalRow = Database['public']['Tables']['feed_signal_events']['Row'];

export function recomputeProfileIntelligence(input: {
  profile: Partial<ProfileRow>;
  contributionStats?: Partial<ContributionStatsRow> | null;
  trustEdges?: Array<Pick<TrustEdgeRow, 'weight' | 'domain_tag' | 'edge_type'>> | null;
  endorsements?: Array<Pick<EndorsementRow, 'domain_tag' | 'weight'>> | null;
  feedSignals?: Array<Pick<FeedSignalRow, 'signal_type' | 'duration_ms'>> | null;
}) {
  const behavioralSignals = computeBehavioralSignals({
    contributionStats: input.contributionStats,
    feedSignals: input.feedSignals,
  });
  const trustProfile = computeTrustProfile({
    trustEdges: input.trustEdges,
    endorsements: input.endorsements,
  });
  const contributionProfile = computeContributionProfile({
    contributionStats: input.contributionStats,
    profile: input.profile,
  });
  const growthTrajectory = computeGrowthTrajectory({
    profile: input.profile,
    trustProfile,
    behavioralSignals,
  });

  const identityConfidenceScore = Math.min(
    100,
    Math.round(
      ((input.profile.persona_completion_score ?? 0) * 0.35) +
        ((input.profile.consistency_score ?? 0) * 0.2) +
        ((input.profile.depth_score ?? 0) * 0.15) +
        ((input.profile.impact_score ?? 0) * 0.15) +
        ((input.profile.domain_authority_score ?? 0) * 0.15),
    ),
  );

  return {
    contribution_profile: contributionProfile,
    trust_profile: trustProfile,
    behavioral_signals: behavioralSignals,
    growth_trajectory: growthTrajectory,
    identity_confidence_score: identityConfidenceScore,
  };
}
