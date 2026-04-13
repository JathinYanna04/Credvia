import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PostDetail } from '@/components/post/PostDetail';
import type { PostSummary } from '@/lib/types';

(globalThis as { React?: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const basePost: PostSummary = {
  id: 'idea-post-1',
  title: 'Onboarding QA copilot for SaaS implementation teams',
  body: 'Founders need a way to detect launch risk before customers go live.',
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-08T00:00:00.000Z',
  postType: 'startup_idea',
  voteScore: 12,
  currentUserVote: 1,
  commentCount: 0,
  saveCount: 0,
  author: {
    id: 'founder-1',
    username: 'founder',
    fullName: 'Founder One',
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
    icon: 'S',
    memberCount: 10,
    postCount: 20,
    accent: 'var(--accent)',
  },
  tags: [],
  startupIdea: {
    problem: 'Launches often fail due to hidden onboarding gaps.',
    targetAudience: 'Onboarding leaders at B2B SaaS companies.',
    solution: 'An AI QA assistant that flags launch blockers before go-live.',
    marketCategory: 'SaaS operations',
    stage: 'problem_validation',
    monetizationModel: 'Subscription',
    validationScore: 71,
    uniqueCommenters: 0,
    followerCount: 4,
    revisionCount: 2,
  },
};

describe('PostDetail founder ai mount', () => {
  it('shows the founder AI review section for startup idea detail pages', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PostDetail, {
        post: basePost,
        comments: [],
        currentUserId: 'founder-1',
      }),
    );

    expect(markup).toContain('AI Idea Review');
    expect(markup).toContain('Founder Intelligence');
    expect(markup).toContain('Get AI Feedback');
  });

  it('shows pending community validation and separate AI assessment when community data is missing', () => {
    const pendingWithAi: PostSummary = {
      ...basePost,
      voteScore: 0,
      upvoteCount: 0,
      downvoteCount: 0,
      commentCount: 0,
      saveCount: 0,
      startupIdea: {
        ...basePost.startupIdea!,
        validationScore: 0,
        uniqueCommenters: 0,
        aiAssessment: {
          verdict: 'promising',
          confidence: 0.8,
        },
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(PostDetail, {
        post: pendingWithAi,
        comments: [],
        currentUserId: 'founder-1',
      }),
    );

    expect(markup).toContain('Community validation pending');
    expect(markup).toContain('AI assessment: Promising (80% confidence)');
  });

  it('shows numeric community validation when engagement data exists', () => {
    const withCommunitySignals: PostSummary = {
      ...basePost,
      upvoteCount: 3,
      downvoteCount: 0,
      commentCount: 2,
      saveCount: 1,
      startupIdea: {
        ...basePost.startupIdea!,
        validationScore: 7,
        uniqueCommenters: 2,
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(PostDetail, {
        post: withCommunitySignals,
        comments: [],
        currentUserId: 'founder-1',
      }),
    );

    expect(markup).toContain('Community validation: 7/10');
  });

  it('does not show founder AI review section for non-startup posts', () => {
    const nonStartup: PostSummary = {
      ...basePost,
      id: 'discussion-1',
      postType: 'discussion',
      startupIdea: undefined,
    };

    const markup = renderToStaticMarkup(
      React.createElement(PostDetail, {
        post: nonStartup,
        comments: [],
        currentUserId: 'founder-1',
      }),
    );

    expect(markup).not.toContain('AI Idea Review');
    expect(markup).not.toContain('Founder Intelligence');
    expect(markup).not.toContain('Get AI Feedback');
  });
});
