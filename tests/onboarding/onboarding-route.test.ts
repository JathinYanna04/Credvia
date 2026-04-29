import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const ensureProfileRecord = vi.fn();
const captureServerEvent = vi.fn().mockResolvedValue(undefined);
const isSchemaCompatibilityError = vi.fn(() => false);

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
  ensureProfileRecord,
  isSchemaCompatibilityError,
}));

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
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
    const updateUserEq = vi.fn().mockResolvedValue({ error: null });

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

        if (table === 'users') {
          return {
            update: vi.fn(() => ({
              eq: updateUserEq,
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({ user_id: 'user-1', primary_persona: null, metadata: {} });

    const { POST } = await import('@/app/api/v1/users/me/onboarding/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/users/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: ['skill-1', 'skill-2'],
          communityIds: ['community-1', 'community-2'],
          profile: {
            username: 'credvia_founder',
            full_name: 'Credvia Builder',
            headline: 'Shipping real software',
            primary_persona: 'founder',
            persona_details: {
              founder: {
                startup_name: 'Credvia',
                stage: 'MVP',
              },
            },
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
      primary_persona: 'founder',
      onboarding_complete: true,
    });
  });

  it('marks onboarding complete with only persona, username, and full name', async () => {
    const profileUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const updateUserEq = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            update: vi.fn(() => ({
              eq: profileUpdateEq,
            })),
          };
        }

        if (table === 'users') {
          return {
            update: vi.fn(() => ({
              eq: updateUserEq,
            })),
          };
        }

        if (table === 'user_skills' || table === 'community_memberships') {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(),
            })),
            insert: vi.fn(),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({
      user_id: 'user-1',
      username: 'starter_name',
      full_name: null,
      primary_persona: null,
      metadata: {},
    });

    const { POST } = await import('@/app/api/v1/users/me/onboarding/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/users/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            username: 'credvia_builder',
            full_name: 'Credvia Builder',
            primary_persona: 'founder',
          },
          onboarding_complete: true,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      onboarding_complete: true,
      primary_persona: 'founder',
      requires_onboarding: false,
    });
  });

  it('preserves prior skills and communities when a later onboarding step only updates profile data', async () => {
    const profileUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const deleteSkillsEq = vi.fn();
    const deleteMembershipsEq = vi.fn();
    const insertUserSkills = vi.fn();
    const insertMemberships = vi.fn();
    const updateUserEq = vi.fn();

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

        if (table === 'users') {
          return {
            update: vi.fn(() => ({
              eq: updateUserEq,
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({ user_id: 'user-1', primary_persona: null, metadata: {} });

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

  it('retries onboarding profile updates without metadata on a legacy schema', async () => {
    isSchemaCompatibilityError.mockReturnValue(true);
    const profileUpdateEq = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'column profiles.metadata does not exist' } })
      .mockResolvedValueOnce({ error: null });
    const legacyUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const updateUserEq = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            update: vi.fn(() => ({
              eq: table === 'profiles' ? profileUpdateEq : legacyUpdateEq,
            })),
          };
        }

        if (table === 'users') {
          return {
            update: vi.fn(() => ({
              eq: updateUserEq,
            })),
          };
        }

        if (table === 'user_skills' || table === 'community_memberships') {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(),
            })),
            insert: vi.fn(),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    ensureProfileRecord.mockResolvedValue({
      user_id: 'user-1',
      username: 'starter_name',
      full_name: null,
      primary_persona: null,
      metadata: {},
    });

    const { POST } = await import('@/app/api/v1/users/me/onboarding/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/users/me/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            username: 'credvia_builder',
            full_name: 'Credvia Builder',
            primary_persona: 'founder',
          },
          onboarding_complete: true,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.saved).toBe(true);
    expect(profileUpdateEq).toHaveBeenCalled();
    expect(legacyUpdateEq).not.toHaveBeenCalled();
    const retryPayload = profileUpdateEq.mock.calls[1]?.[0] as Record<string, unknown> | undefined;
    expect(retryPayload).toBeDefined();
    expect(retryPayload).not.toHaveProperty('metadata');
  });
});
