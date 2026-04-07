import { describe, expect, it } from 'vitest';
import { buildFeedExplanation } from '@/lib/utils/feed-rank';
import type { PostSummary } from '@/lib/types';

describe('buildFeedExplanation', () => {
  it('returns human-readable reasons for why a post is ranked', () => {
    const post = {
      id: 'post-1',
      title: 'Founder traction notes',
      body: 'We shipped an MVP and learned from early users.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      postType: 'startup_idea',
      voteScore: 8,
      currentUserVote: 0,
      commentCount: 4,
      saveCount: 2,
      tags: ['startup'],
      author: {
        id: 'user-1',
        username: 'builder',
        fullName: 'Builder',
        headline: 'Founder',
        avatarUrl: '',
        primaryPersona: 'founder',
        expertiseTags: ['gtm'],
        interestTags: ['startup'],
        skills: [],
        reputation: [],
        scoreSummary: {
          contribution_score: 20,
          credibility_score: 28,
          helpfulness_score: 10,
          expertise_score: 12,
          community_score: 5,
          persona_completion_score: 80,
        },
      },
      community: {
        id: 'c-1',
        name: 'Startups',
        slug: 'startups',
        description: '',
        icon: 'S',
        memberCount: 1,
        postCount: 1,
        accent: 'var(--accent)',
      },
    } as PostSummary;

    const explanation = buildFeedExplanation(post, {
      tab: 'founders',
      persona: 'founder',
    });

    expect(explanation.layer).toBe('real-time');
    expect(explanation.reasons.length).toBeGreaterThan(0);
  });
});
