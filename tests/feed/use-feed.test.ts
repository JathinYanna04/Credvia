import { describe, expect, it } from 'vitest';
import type { PostSummary } from '@/lib/types';
import { mergeFeedPosts } from '@/lib/hooks/useFeed';

const basePost: PostSummary = {
  id: 'post-1',
  title: 'Idea title',
  body: 'Idea body',
  createdAt: '2026-04-06T09:00:00.000Z',
  updatedAt: '2026-04-06T09:00:00.000Z',
  postType: 'discussion',
  voteScore: 3,
  viewerVote: 1,
  commentCount: 2,
  saveCount: 0,
  author: {
    id: 'user-1',
    username: 'user1',
    fullName: 'User One',
    headline: '',
    avatarUrl: '',
    skills: [],
    reputation: [],
  },
  community: {
    id: 'community-1',
    name: 'Startups',
    slug: 'startups',
    description: '',
    icon: 'ST',
    memberCount: 1,
    postCount: 1,
    accent: 'var(--accent)',
  },
  tags: [],
};

describe('mergeFeedPosts', () => {
  it('keeps a newer local vote state when a stale fetch returns older post data', () => {
    const current = [
      {
        ...basePost,
        voteScore: 5,
        viewerVote: 1 as const,
        updatedAt: '2026-04-06T10:00:00.000Z',
      },
    ];
    const incoming = [
      {
        ...basePost,
        voteScore: 3,
        viewerVote: 0 as const,
        updatedAt: '2026-04-06T09:30:00.000Z',
      },
    ];

    const [merged] = mergeFeedPosts(current, incoming);

    if (!merged) {
      throw new Error('Expected merged post');
    }
    expect(merged.voteScore).toBe(5);
    expect(merged.viewerVote).toBe(1);
    expect(merged.updatedAt).toBe('2026-04-06T10:00:00.000Z');
  });
});
