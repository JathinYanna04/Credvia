import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const getOwnedResume = vi.fn();
const getJobCardsByIds = vi.fn();
const captureServerEvent = vi.fn();

function createSupabaseMock(options?: {
  nextResumeId?: string | null;
  profileExists?: boolean;
}) {
  const nextResumeId = options?.nextResumeId ?? null;
  const profileExists = options?.profileExists ?? true;

  return {
    from: vi.fn((table: string) => {
      if (table === 'resumes') {
        return {
          update() {
            return {
              eq() {
                return {
                  eq: async () => ({ error: null }),
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data: nextResumeId ? { id: nextResumeId } : null,
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
              order() {
                return {
                  limit() {
                    return {
                      maybeSingle: async () => ({
                        data: nextResumeId ? { id: nextResumeId } : null,
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq: async () => ({ error: null }),
            };
          },
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data: nextResumeId ? { id: nextResumeId } : null,
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'resume_profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: profileExists
                      ? {
                          raw_sections: {
                            __structured: {
                              candidate: {
                                full_name: 'Jane Builder',
                                current_title: 'Engineer',
                                email: 'jane@example.com',
                                phone: null,
                                location: null,
                                linkedin: null,
                                github: null,
                                portfolio: null,
                                summary: null,
                              },
                            },
                          },
                        }
                      : null,
                    error: null,
                  }),
                };
              },
            };
          },
          update() {
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        remove: async () => ({ error: null }),
      })),
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/career-match/queries', () => ({
  getOwnedResume,
  getJobCardsByIds,
}));

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
}));

describe('resume management route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobCardsByIds.mockResolvedValue([]);
  });

  it('sets a resume as active via PATCH', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getOwnedResume.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      is_active: false,
    });

    const { PATCH } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/resumes/resume-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      updated: true,
      resumeId: 'resume-1',
      isActive: true,
    });
  });

  it('deletes a resume and returns success payload', async () => {
    const supabase = createSupabaseMock({ nextResumeId: 'resume-2' });

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getOwnedResume.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      is_active: true,
    });

    const { DELETE } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await DELETE(
      new Request('http://localhost:3000/api/v1/resumes/resume-1', {
        method: 'DELETE',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      deleted: true,
      resumeId: 'resume-1',
    });
  });

  it('returns 404 for PATCH when resume is missing', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getOwnedResume.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/resumes/missing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      }),
      { params: { id: 'missing' } },
    );

    expect(response.status).toBe(404);
  });

  it('saves manual overrides via PATCH', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getOwnedResume.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      is_active: true,
    });

    const { PATCH } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/resumes/resume-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualOverrides: {
            candidate: {
              full_name: 'Jane Builder',
              email: 'jane@example.com',
            },
          },
        }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      updated: true,
      resumeId: 'resume-1',
      manualOverridesSaved: true,
    });
  });

  it('returns 401 for DELETE when user is unauthenticated', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { DELETE } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await DELETE(
      new Request('http://localhost:3000/api/v1/resumes/resume-1', {
        method: 'DELETE',
      }),
      { params: { id: 'resume-1' } },
    );

    expect(response.status).toBe(401);
  });
});
