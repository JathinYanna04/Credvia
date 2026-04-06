import { fail, handleApiError, ok } from '@/lib/api';
import {
  buildExplainableReputationBreakdown,
  computeBehavioralSignals,
  computeContributionProfile,
  computeGrowthTrajectory,
  computeTrustProfile,
} from '@/lib/intelligence/reputation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { resolveTargetUserId } from '../_resolve-user';

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    await getRequiredUser(supabase);
    const targetUserId = await resolveTargetUserId(supabase, params.username);

    const [profileResult, statsResult, reputationResult, trustEdgesResult, endorsementsResult, reputationEventsResult, feedSignalsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'user_id, contribution_score, credibility_score, helpfulness_score, expertise_score, community_score, persona_completion_score, identity_confidence_score, consistency_score, depth_score, impact_score, signal_to_noise_ratio, domain_authority_score, contribution_profile, trust_profile, behavioral_signals, growth_trajectory',
        )
        .eq('user_id', targetUserId)
        .maybeSingle(),
      supabase.from('user_contribution_stats').select('*').eq('user_id', targetUserId).maybeSingle(),
      supabase
        .from('community_reputation')
        .select('community_id, score')
        .eq('user_id', targetUserId)
        .order('score', { ascending: false })
        .limit(10),
      supabase
        .from('trust_edges')
        .select('source_user_id, target_user_id, domain_tag, edge_type, weight')
        .eq('target_user_id', targetUserId)
        .order('weight', { ascending: false })
        .limit(25),
      supabase
        .from('endorsement_graph')
        .select('endorser_user_id, endorsed_user_id, domain_tag, note, weight')
        .eq('endorsed_user_id', targetUserId)
        .order('updated_at', { ascending: false })
        .limit(25),
      supabase
        .from('reputation_events')
        .select('id, event_type, points, metadata, created_at, entity_type, entity_id')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('feed_signal_events')
        .select('signal_type, duration_ms, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    if (statsResult.error) {
      throw new Error(statsResult.error.message);
    }

    if (reputationResult.error) {
      throw new Error(reputationResult.error.message);
    }

    if (trustEdgesResult.error) {
      throw new Error(trustEdgesResult.error.message);
    }

    if (endorsementsResult.error) {
      throw new Error(endorsementsResult.error.message);
    }

    if (reputationEventsResult.error) {
      throw new Error(reputationEventsResult.error.message);
    }

    if (feedSignalsResult.error) {
      throw new Error(feedSignalsResult.error.message);
    }

    const behavioralSignals = computeBehavioralSignals({
      contributionStats: statsResult.data,
      feedSignals: feedSignalsResult.data,
    });
    const trustProfile = computeTrustProfile({
      trustEdges: trustEdgesResult.data,
      endorsements: endorsementsResult.data,
    });
    const contributionProfile = computeContributionProfile({
      contributionStats: statsResult.data,
      profile: profileResult.data,
    });
    const growthTrajectory = computeGrowthTrajectory({
      profile: profileResult.data,
      trustProfile,
      behavioralSignals,
    });

    return ok({
      scoreSummary: profileResult.data
        ? {
            contribution_score: profileResult.data.contribution_score,
            credibility_score: profileResult.data.credibility_score,
            helpfulness_score: profileResult.data.helpfulness_score,
            expertise_score: profileResult.data.expertise_score,
            community_score: profileResult.data.community_score,
            persona_completion_score: profileResult.data.persona_completion_score,
            identity_confidence_score: profileResult.data.identity_confidence_score,
            consistency_score: profileResult.data.consistency_score,
            depth_score: profileResult.data.depth_score,
            impact_score: profileResult.data.impact_score,
            signal_to_noise_ratio: profileResult.data.signal_to_noise_ratio,
            domain_authority_score: profileResult.data.domain_authority_score,
          }
        : null,
      contributionStats: statsResult.data ?? null,
      communityReputation: reputationResult.data ?? [],
      trustEdges: trustEdgesResult.data ?? [],
      endorsements: endorsementsResult.data ?? [],
      reputationTimeline: reputationEventsResult.data ?? [],
      explainableBreakdown: profileResult.data
        ? buildExplainableReputationBreakdown({
            profile: profileResult.data,
            contributionStats: statsResult.data,
            trustEdges: trustEdgesResult.data,
            endorsements: endorsementsResult.data,
          })
        : [],
      contributionProfile,
      trustProfile,
      behavioralSignals,
      growthTrajectory,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Response) {
      return error;
    }

    return handleApiError(error);
  }
}
