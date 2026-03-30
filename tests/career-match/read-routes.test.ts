import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const getJobCardsByIds = vi.fn();
const getOwnedResume = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/career-match/queries', () => ({
  getJobCardsByIds,
  getOwnedResume,
}));

describe('career match read routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a public job detail payload', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getJobCardsByIds.mockResolvedValue([
      {
        id: 'job-1',
        is_active: true,
        title: 'Founding Engineer',
        company: { company_name: 'Orbit' },
        skills: [],
      },
    ]);

    const { GET } = await import('@/app/api/v1/jobs/[id]/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/jobs/job-1'), {
      params: { id: 'job-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.title).toBe('Founding Engineer');
  });

  it('returns resume detail only for the owner', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'resume_profiles') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: { resume_id: 'resume-1' }, error: null }),
                  };
                },
              };
            },
          };
        }

        if (table === 'resume_skills') {
          return {
            select() {
              return {
                eq: async () => ({
                  data: [{ source_type: 'explicit', confidence: 1, skill_slug: 'react', skill_name: 'React' }],
                  error: null,
                }),
              };
            },
          };
        }

        if (table === 'resume_analysis_runs') {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return {
                        limit: async () => ({ data: [{ id: 'run-1' }], error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'job_matches') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        order() {
                          return {
                            limit: async () => ({ data: [{ id: 'match-1', job_id: 'job-1' }], error: null }),
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

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getOwnedResume.mockResolvedValue({ id: 'resume-1', user_id: 'user-1' });
    getJobCardsByIds.mockResolvedValue([{ id: 'job-1', title: 'Founding Engineer', company: null, skills: [] }]);

    const { GET } = await import('@/app/api/v1/resumes/[id]/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/resumes/resume-1'), {
      params: { id: 'resume-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.resume.id).toBe('resume-1');
    expect(payload.data.skills[0].skill.slug).toBe('react');
  });
});
