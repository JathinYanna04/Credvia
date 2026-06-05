import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceRoleClient = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

describe('ensureProfileRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to a legacy profile select without website, metadata, or onboarding_completed_at when the schema is incompatible', async () => {
    const legacyProfile = {
      user_id: 'user-1',
      username: 'builder_123',
      full_name: 'Credvia Builder',
      headline: null,
      bio: null,
      avatar_url: null,
      location: null,
      current_company: null,
      education: null,
      profile_visibility: {},
      onboarding_complete: false,
      created_at: '2026-04-29T00:00:00.000Z',
      updated_at: '2026-04-29T00:00:00.000Z',
    };

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table !== 'users') {
          throw new Error(`Unexpected service table ${table}`);
        }

        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    const profileSelect = vi.fn((selectClause: string) => {
      if (
        selectClause.includes('website') ||
        selectClause.includes('metadata') ||
        selectClause.includes('onboarding_completed_at')
      ) {
        return {
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'column profiles.onboarding_completed_at does not exist' },
            }),
          }),
        };
      }

      return {
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: legacyProfile,
            error: null,
          }),
        }),
      };
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'profiles' && table !== 'users') {
          throw new Error(`Unexpected table ${table}`);
        }

        if (table === 'profiles') {
          return {
            select: profileSelect,
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { account_type: 'founder' },
                error: null,
              }),
            }),
          }),
        };
      }),
    } as never;

    createServiceRoleClient.mockReturnValue(serviceClient);

    const { ensureProfileRecord } = await import('@/lib/supabase/helpers');

    const profile = await ensureProfileRecord(supabase, {
      id: 'user-1',
      email: 'builder@example.com',
      user_metadata: { full_name: 'Credvia Builder', account_type: 'founder' },
      app_metadata: { provider: 'google' },
    } as never);

    expect(profile.username).toBe('builder_123');
    expect(profile.full_name).toBe('Credvia Builder');
    expect(profile.onboarding_complete).toBe(false);
    expect(profileSelect).toHaveBeenCalledTimes(2);
    expect(profileSelect.mock.calls[1]?.[0]).not.toContain('website');
    expect(profileSelect.mock.calls[1]?.[0]).not.toContain('metadata');
    expect(profileSelect.mock.calls[1]?.[0]).not.toContain('onboarding_completed_at');
  });
});