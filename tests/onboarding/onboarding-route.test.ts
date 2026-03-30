import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const ensureProfileRecord = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
  ensureProfileRecord,
}));

describe('onboarding route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces profile, skills, and community selections for the signed-in user', async () => {
    const profileUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const deleteSkillsEq = vi.fn().mockResolvedValue({ error: null });
    const deleteMembershipsEq = vi.fn().mockResolvedValue({ error: null });
    const insertUserSkills = vi.fn().mockResolvedValue({ error: null });
    const insertMemberships = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            update: vi.fn(() => ({
              eq: profileUpdateEq,
            })),
          };
        }

        if (table === 'user_skills') {
          return {
            delete: vi.fn(() => ({
              eq: deleteSkillsEq,
            })),
            insert: insertUserSkills,
          };
        }

        if (table === 'community_memberships') {
          return {
            delete: vi.fn(() => ({
              eq: deleteMembershipsEq,
            })),
            insert: insertMemberships,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({ user_id: 'user-1' });

    const { POST } = await import('@/app/api/v1/users/me/onboarding/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/users/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: ['skill-1', 'skill-2'],
          communityIds: ['community-1', 'community-2'],
          profile: {
            full_name: 'Credvia Builder',
            headline: 'Shipping real software',
          },
          onboarding_complete: true,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureProfileRecord).toHaveBeenCalled();
    expect(insertUserSkills).toHaveBeenCalledWith([
      { user_id: 'user-1', skill_id: 'skill-1' },
      { user_id: 'user-1', skill_id: 'skill-2' },
    ]);
    expect(insertMemberships).toHaveBeenCalledWith([
      { user_id: 'user-1', community_id: 'community-1', role: 'member' },
      { user_id: 'user-1', community_id: 'community-2', role: 'member' },
    ]);
    expect(payload.data).toMatchObject({
      saved: true,
      skills: 2,
      communities: 2,
      onboarding_complete: true,
    });
  });

  it('preserves prior skills and communities when a later onboarding step only updates profile data', async () => {
    const profileUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const deleteSkillsEq = vi.fn();
    const deleteMembershipsEq = vi.fn();
    const insertUserSkills = vi.fn();
    const insertMemberships = vi.fn();

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            update: vi.fn(() => ({
              eq: profileUpdateEq,
            })),
          };
        }

        if (table === 'user_skills') {
          return {
            delete: vi.fn(() => ({
              eq: deleteSkillsEq,
            })),
            insert: insertUserSkills,
          };
        }

        if (table === 'community_memberships') {
          return {
            delete: vi.fn(() => ({
              eq: deleteMembershipsEq,
            })),
            insert: insertMemberships,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({ user_id: 'user-1' });

    const { POST } = await import('@/app/api/v1/users/me/onboarding/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/users/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            full_name: 'Credvia Builder',
            headline: 'Shipping real software',
          },
          onboarding_complete: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteSkillsEq).not.toHaveBeenCalled();
    expect(deleteMembershipsEq).not.toHaveBeenCalled();
    expect(insertUserSkills).not.toHaveBeenCalled();
    expect(insertMemberships).not.toHaveBeenCalled();
  });
});
