import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeResumeResponse } from '@/lib/types';
import { ResumePersistenceError } from '@/lib/resume/persistence-error';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getResumeById = vi.fn();
const getActiveResume = vi.fn();
const runResumeAnalysis = vi.fn();
const captureServerEvent = vi.fn();
const sendResumeAnalysisEmail = vi.fn();

function createSupabaseMock(options?: {
  latestRun?: unknown;
  latestRunError?: { message: string } | null;
  existingResume?: { id: string; user_id: string } | null;
}) {
  const latestRun = options?.latestRun ?? null;
  const latestRunError = options?.latestRunError ?? null;
  const existingResume = options?.existingResume ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === 'resumes') {
        return {
          update() {
            return {
              eq: async () => ({ error: null }),
            };
          },
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: existingResume,
                    error: null,
                  }),
                };
              },
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
  getResumeById,
  getActiveResume,
}));

vi.mock('@/lib/resume/analyze', () => ({
  runResumeAnalysis,
}));

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
}));

vi.mock('@/lib/email/send-resume-analysis-email', () => ({
  sendResumeAnalysisEmail,
}));

describe('resume analyze route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes a READY resume and returns match count', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'READY',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    runResumeAnalysis.mockResolvedValue({ matchCount: 12 });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = (await response.json()) as { data: AnalyzeResumeResponse };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      analyzed: true,
      resumeId: 'resume-1',
      status: 'ANALYZED',
      matchCount: 12,
    });
    expect(runResumeAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
    );
  });

  it('returns 422 when resume is not in READY state', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'UPLOADED',
    });

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
    expect(payload.error.code).toBe('RESUME_NOT_READY');
    expect(payload.error.suggestedAction).toContain('Run extraction');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('returns 409 when processing is already in progress', async () => {
    const supabase = createSupabaseMock({
      latestRun: {
        id: 'run-1',
        resume_id: 'resume-1',
        user_id: 'user-1',
        status: 'running',
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
      },
    });

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'ANALYZING',
    });

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

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('ANALYSIS_IN_PROGRESS');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('returns 422 if forceOCR is sent to analyze endpoint', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'READY',
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceOCR: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('RESUME_NOT_READY');
    expect(payload.error.suggestedAction).toContain('Force OCR');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('returns 403 when resume belongs to another user', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'other-user',
      file_path: 'other-user/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'READY',
    });

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

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('returns 404 when resume does not exist', async () => {
    const supabase = createSupabaseMock({ existingResume: null });

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/missing/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'missing' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('supports rerun by transitioning ANALYZED back to READY', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'ANALYZED',
    });
    runResumeAnalysis.mockResolvedValue({ matchCount: 4 });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rerun: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = (await response.json()) as { data: AnalyzeResumeResponse };

    expect(response.status).toBe(200);
    expect(payload.data.matchCount).toBe(4);
    expect(runResumeAnalysis).toHaveBeenCalled();
  });

  it('rejects invalid analyze body with 400 validation error', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rerun: 'yes' }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(runResumeAnalysis).not.toHaveBeenCalled();
  });

  it('returns actionable 500 details on lifecycle persistence failures', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'READY',
    });
    runResumeAnalysis.mockRejectedValue(
      new ResumePersistenceError(
        'Failed to persist resume lifecycle status.',
        {
          operation: 'update-parse-status',
          table: 'resumes',
          resumeId: 'resume-1',
          targetStatus: 'ANALYZING',
        },
        {
          message: 'new row violates check constraint',
          code: '23514',
          details: 'parse_status ANALYZING is not allowed',
          hint: null,
        },
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

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('INTERNAL_ERROR');
    expect(payload.error.details).toMatchObject({
      operation: 'update-parse-status',
      dbCode: '23514',
      targetStatus: 'ANALYZING',
    });
  });
});
