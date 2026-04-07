import type { Database } from '@/lib/supabase/types';
import type { ReputationBreakdownItem } from '@/lib/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ContributionStatsRow = Database['public']['Tables']['user_contribution_stats']['Row'];
type TrustEdgeRow = Database['public']['Tables']['trust_edges']['Row'];
type EndorsementRow = Database['public']['Tables']['endorsement_graph']['Row'];
type FeedSignalRow = Database['public']['Tables']['feed_signal_events']['Row'];

export function computeBehavioralSignals(input: {
  contributionStats?: Partial<ContributionStatsRow> | null;
  feedSignals?: Array<Pick<FeedSignalRow, 'signal_type' | 'duration_ms'>> | null;
}) {
  const stats = input.contributionStats ?? {};
  const signals = input.feedSignals ?? [];
  const dwellSamples = signals
    .map((signal) => signal.duration_ms ?? 0)
    .filter((duration) => duration > 0);
  const avgDwell =
    dwellSamples.length > 0
      ? Math.round(dwellSamples.reduce((sum, value) => sum + value, 0) / dwellSamples.length)
      : 0;

  return {
    contribution_velocity: (stats.posts_count ?? 0) + (stats.comments_count ?? 0),
    response_rate: stats.votes_cast ?? 0,
    avg_dwell_ms: avgDwell,
    action_diversity: new Set(signals.map((signal) => signal.signal_type)).size,
  };
}

export function computeTrustProfile(input: {
  trustEdges?: Array<Pick<TrustEdgeRow, 'weight' | 'domain_tag' | 'edge_type'>> | null;
  endorsements?: Array<Pick<EndorsementRow, 'domain_tag' | 'weight'>> | null;
}) {
  const trustEdges = input.trustEdges ?? [];
  const endorsements = input.endorsements ?? [];
  const byDomain = new Map<string, number>();

  trustEdges.forEach((edge) => {
    byDomain.set(edge.domain_tag, (byDomain.get(edge.domain_tag) ?? 0) + edge.weight);
  });

  endorsements.forEach((endorsement) => {
    byDomain.set(
      endorsement.domain_tag,
      (byDomain.get(endorsement.domain_tag) ?? 0) + endorsement.weight * 3,
    );
  });

  return {
    domains: [...byDomain.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([domain, score]) => ({ domain, score })),
    trust_edge_count: trustEdges.length,
    endorsement_count: endorsements.length,
  };
}

export function computeContributionProfile(input: {
  contributionStats?: Partial<ContributionStatsRow> | null;
  profile?: Partial<ProfileRow> | null;
}) {
  const stats = input.contributionStats ?? {};
  const profile = input.profile ?? {};
  const contributionTotal =
    (stats.posts_count ?? 0) +
    (stats.comments_count ?? 0) +
    (stats.startup_ideas_count ?? 0) +
    (stats.mentor_answers_count ?? 0);

  return {
    total_surface_count: contributionTotal,
    helpfulness: profile.helpfulness_score ?? 0,
    contribution: profile.contribution_score ?? 0,
    authority: profile.domain_authority_score ?? 0,
    strongest_modes: [
      stats.posts_count ? 'posting' : null,
      stats.comments_count ? 'discussion' : null,
      stats.startup_ideas_count ? 'building' : null,
      stats.mentor_answers_count ? 'mentoring' : null,
    ].filter(Boolean),
  };
}

export function computeGrowthTrajectory(input: {
  profile?: Partial<ProfileRow> | null;
  trustProfile?: ReturnType<typeof computeTrustProfile>;
  behavioralSignals?: ReturnType<typeof computeBehavioralSignals>;
}) {
  const profile = input.profile ?? {};

  return {
    consistency_score: profile.consistency_score ?? 0,
    depth_score: profile.depth_score ?? 0,
    impact_score: profile.impact_score ?? 0,
    identity_confidence_score: profile.identity_confidence_score ?? 0,
    domain_count: input.trustProfile?.domains.length ?? 0,
    learning_velocity: input.behavioralSignals?.contribution_velocity ?? 0,
  };
}

export function buildExplainableReputationBreakdown(input: {
  profile: Partial<ProfileRow>;
  contributionStats?: Partial<ContributionStatsRow> | null;
  trustEdges?: Array<Pick<TrustEdgeRow, 'weight'>> | null;
  endorsements?: Array<Pick<EndorsementRow, 'weight'>> | null;
}): ReputationBreakdownItem[] {
  const stats = input.contributionStats ?? {};
  const trustEdgeWeight = (input.trustEdges ?? []).reduce((sum, edge) => sum + edge.weight, 0);
  const endorsementWeight = (input.endorsements ?? []).reduce(
    (sum, endorsement) => sum + endorsement.weight,
    0,
  );

  return [
    {
      label: 'Contribution',
      value: input.profile.contribution_score ?? 0,
      description: `Based on ${stats.posts_count ?? 0} posts, ${stats.comments_count ?? 0} comments, and visible proof of work.`,
    },
    {
      label: 'Credibility',
      value: input.profile.credibility_score ?? 0,
      description: `Built from weighted votes, consistency, and domain-specific trust.`,
    },
    {
      label: 'Helpfulness',
      value: input.profile.helpfulness_score ?? 0,
      description: `Driven by useful answers, guidance patterns, and strong response signals.`,
    },
    {
      label: 'Trust Graph',
      value: trustEdgeWeight + endorsementWeight,
      description: `Includes ${input.trustEdges?.length ?? 0} trust edges and ${input.endorsements?.length ?? 0} endorsements.`,
    },
    {
      label: 'Identity Confidence',
      value: input.profile.identity_confidence_score ?? 0,
      description: `Higher when your profile, actions, and domain signals consistently point in the same direction.`,
    },
  ];
}

