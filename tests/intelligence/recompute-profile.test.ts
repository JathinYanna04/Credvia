import { describe, expect, it } from 'vitest';
import { recomputeProfileIntelligence } from '@/lib/intelligence/recompute-profile';

describe('recomputeProfileIntelligence', () => {
  it('returns explainable dynamic identity payloads from profile and graph signals', () => {
    const result = recomputeProfileIntelligence({
      profile: {
        persona_completion_score: 70,
        consistency_score: 40,
        depth_score: 32,
        impact_score: 28,
        domain_authority_score: 24,
        contribution_score: 18,
        helpfulness_score: 12,
      },
      contributionStats: {
        posts_count: 4,
        comments_count: 11,
        mentor_answers_count: 2,
        startup_ideas_count: 1,
        votes_cast: 9,
      },
      trustEdges: [
        { weight: 3, domain_tag: 'backend', edge_type: 'vote_signal' },
        { weight: 5, domain_tag: 'backend', edge_type: 'endorsement' },
      ],
      endorsements: [{ domain_tag: 'backend', weight: 2 }],
      feedSignals: [
        { signal_type: 'open', duration_ms: 1200 },
        { signal_type: 'dwell', duration_ms: 3800 },
      ],
    });

    expect(result.identity_confidence_score).toBeGreaterThan(0);
    expect(result.trust_profile).toMatchObject({
      trust_edge_count: 2,
      endorsement_count: 1,
    });
    expect(result.behavioral_signals).toMatchObject({
      contribution_velocity: 15,
    });
  });
});
