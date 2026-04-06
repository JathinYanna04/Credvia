import { describe, expect, it } from 'vitest';
import { buildProfileCompletionChecklist } from '@/lib/profile-completion';

describe('profile completion checklist', () => {
  it('separates basic entry completion from richer credibility steps', () => {
    const result = buildProfileCompletionChecklist({
      profile: {
        primary_persona: 'student',
        username: 'credvia_builder',
        full_name: 'Credvia Builder',
        headline: '',
        bio: '',
        open_to: [],
        profile_intent: [],
        interest_tags: [],
        expertise_tags: [],
      },
      detailRecord: {},
      joinedCommunityIds: [],
      selectedSkillIds: [],
      contributionStats: {
        posts_count: 0,
        comments_count: 0,
      },
    });

    expect(result.entryComplete).toBe(true);
    expect(result.items.find((item) => item.id === 'student-college')?.complete).toBe(false);
    expect(result.items.find((item) => item.id === 'identity-headline')?.complete).toBe(false);
  });
});
