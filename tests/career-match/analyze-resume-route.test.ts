import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExtractionError } from '@/lib/resume/extract';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getOwnedResume = vi.fn();
const getActiveResume = vi.fn();
const analyzeStoredResume = vi.fn();
const recomputeMatchesForResume = vi.fn();

function createSupabaseMock(options?: {
  latestRun?: unknown;
  latestRunError?: { message: string } | null;
  downloadError?: { message: string } | null;
}) {
  const latestRun = options?.latestRun ?? null;
  const latestRunError = options?.latestRunError ?? null;
  const downloadError = options?.downloadError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === 'resumes') {
        return {
          update() {
            return {
              eq: async () => ({ error: null }),
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
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data: latestRun,
                            error: latestRunError,
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

      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        download: async () => ({
          data: downloadError ? null : new Blob(['Resume body']),
          error: downloadError,
        }),
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

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/career-match/queries', () => ({
  getOwnedResume,
  getActiveResume,
}));

vi.mock('@/lib/resume/analyze', () => ({
  analyzeStoredResume,
}));

vi.mock('@/lib/matching/service', () => ({
  recomputeMatchesForResume,
}));

describe('resume analyze route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the stored file, analyzes it, and recomputes matches for the active resume', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getOwnedResume.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockResolvedValue({});
    recomputeMatchesForResume.mockResolvedValue(12);

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ analyzed: true, resumeId: 'resume-1' });
    expect(analyzeStoredResume).toHaveBeenCalledOnce();
    expect(recomputeMatchesForResume).toHaveBeenCalledWith(supabase, 'user-1', 'resume-1');
  }, 10000);

  it('returns a structured RESUME_TEXT_MISSING error when extraction quality is too poor', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getOwnedResume.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockRejectedValue(
      new ResumeExtractionError(
        'Extracted text looks like raw PDF internals instead of readable resume content.',
      ),
    );

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toEqual({
      code: 'RESUME_TEXT_MISSING',
      message: 'Upload or parse resume content before analysis.',
    });
    expect(recomputeMatchesForResume).not.toHaveBeenCalled();
  });
});
