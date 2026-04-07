import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const ensureProfileRecord = vi.fn();
const isRecoverableSupabaseReadError = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
  ensureProfileRecord,
  isRecoverableSupabaseReadError,
}));

function createTableResultBuilder<T>(result: { data: T; error: { message?: string } | null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    data: result.data,
    error: result.error,
  };

  return builder;
}

function createUsersMeSupabaseMock(options?: { optionalErrorMessage?: string }) {
  return {
    from: vi.fn((table: string) => {
      const optionalError = options?.optionalErrorMessage
        ? { message: options.optionalErrorMessage }
        : null;

      if (table === 'skills') {
        return createTableResultBuilder({ data: [{ id: 'skill-1', name: 'TypeScript' }], error: optionalError });
      }

      if (table === 'user_skills') {
        return createTableResultBuilder({ data: [{ skill_id: 'skill-1' }], error: optionalError });
      }

      if (table === 'community_memberships') {
        return createTableResultBuilder({ data: [{ community_id: 'community-1' }], error: optionalError });
      }

      if (table === 'profile_persona_details') {
        return createTableResultBuilder({ data: null, error: optionalError });
      }

      if (table === 'topics') {
        return createTableResultBuilder({ data: [{ id: 'topic-1', slug: 'ai', label: 'AI' }], error: optionalError });
      }

      if (table === 'user_topic_follows') {
        return createTableResultBuilder({ data: [{ topic_id: 'topic-1' }], error: optionalError });
      }

      if (table === 'user_contribution_stats') {
        return createTableResultBuilder({ data: null, error: optionalError });
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('users/me GET route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getRequiredUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      user_metadata: {
        full_name: 'Credvia User',
      },
    });
    isRecoverableSupabaseReadError.mockImplementation((error: unknown) => {
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
      return message.includes('permission denied') || message.includes('does not exist') || message.includes('column');
    });
  });

  it('returns safe payload when profile exists', async () => {
    createServerSupabaseClient.mockResolvedValue(createUsersMeSupabaseMock());
    ensureProfileRecord.mockResolvedValue({
      user_id: 'user-1',
      username: 'credvia_user',
      full_name: 'Credvia User',
      headline: null,
      bio: null,
      primary_persona: null,
      profile_intent: [],
      open_to: [],
      interest_tags: [],
      expertise_tags: [],
      onboarding_complete: false,
    });

    const { GET } = await import('@/app/api/v1/users/me/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.profile?.username).toBe('credvia_user');
    expect(Array.isArray(payload.data?.availableSkills)).toBe(true);
  });

  it('returns a safe fallback profile when bootstrap/read is recoverably broken', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createUsersMeSupabaseMock({ optionalErrorMessage: 'relation "topics" does not exist' }),
    );
    ensureProfileRecord.mockRejectedValue(new Error('permission denied for table profiles'));

    const { GET } = await import('@/app/api/v1/users/me/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.profile?.user_id).toBe('user-1');
    expect(payload.data?.profile?.onboarding_complete).toBe(false);
  });

  it('handles incomplete nullable profile shape without assuming persona-specific fields', async () => {
    createServerSupabaseClient.mockResolvedValue(createUsersMeSupabaseMock());
    ensureProfileRecord.mockResolvedValue({
      user_id: 'user-1',
      username: 'credvia_user',
      full_name: null,
      headline: null,
      bio: null,
      primary_persona: null,
      profile_intent: [],
      open_to: [],
      interest_tags: [],
      expertise_tags: [],
      onboarding_complete: false,
    });

    const { GET } = await import('@/app/api/v1/users/me/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.profile?.primary_persona).toBe(null);
    expect(payload.data?.requires_onboarding).toBe(true);
  });
});
