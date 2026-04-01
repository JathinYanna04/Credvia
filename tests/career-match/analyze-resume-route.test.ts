import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExtractionError } from '@/lib/resume/extract';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getResumeById = vi.fn();
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
  getResumeById,
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
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-1',
      file_path: 'user-1/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockResolvedValue({
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdf-ocr', usedOcr: true } } },
      matchedSkillRows: [],
      extraction: {
        method: 'pdf-ocr',
        attemptedMethods: ['pdf-direct', 'pdf-cleaned', 'pdf-token-fallback', 'pdf-ocr'],
        usedOcr: true,
        ocrConfidence: 88,
        quality: {
          confidenceScore: 67,
          confidenceTier: 'medium',
          likelyScannedPdf: true,
          humanReadableRatio: 0.72,
          suspiciousTokenCount: 1,
          resumeHintCount: 6,
        },
      },
    });
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
    expect(payload.data).toMatchObject({
      analyzed: true,
      resumeId: 'resume-1',
      extraction: {
        method: 'pdf-ocr',
        usedOcr: true,
      },
      warning: 'We analyzed your resume, but the text quality was limited. For best results, upload a text-based PDF.',
    });
    expect(analyzeStoredResume).toHaveBeenCalledOnce();
    expect(recomputeMatchesForResume).toHaveBeenCalledWith(supabase, 'user-1', 'resume-1');
  }, 10000);

  it('returns a structured RESUME_TEXT_MISSING error when all extraction attempts fail', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockRejectedValue(
      new ResumeExtractionError('This resume could not be read reliably. Try a clearer PDF or DOCX.'),
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
      message: 'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    });
    expect(recomputeMatchesForResume).not.toHaveBeenCalled();
  });

  it('returns 409 when analysis is already running', async () => {
    const supabase = createSupabaseMock({
      latestRun: { status: 'running', error_message: null },
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
      parse_status: 'uploaded',
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
    expect(analyzeStoredResume).not.toHaveBeenCalled();
  });

  it('returns 404 when the resume does not exist', async () => {
    const supabase = createSupabaseMock();

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
  });

  it('returns 422 when the stored file cannot be downloaded', async () => {
    const supabase = createSupabaseMock({
      downloadError: { message: 'Object not found' },
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
      parse_status: 'uploaded',
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
    expect(payload.error.code).toBe('RESUME_FILE_MISSING');
  });

  it('accepts an empty body and still analyzes successfully', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockResolvedValue({
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdf-direct', usedOcr: false } } },
      matchedSkillRows: [],
      extraction: {
        method: 'pdf-direct',
        attemptedMethods: ['pdf-direct'],
        usedOcr: false,
        ocrConfidence: null,
        quality: {
          confidenceScore: 89,
          confidenceTier: 'high',
          likelyScannedPdf: false,
          humanReadableRatio: 0.88,
          suspiciousTokenCount: 0,
          resumeHintCount: 8,
        },
      },
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    expect(response.status).toBe(200);
    expect(analyzeStoredResume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      {},
    );
  });

  it('returns 400 for invalid request schema', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceOCR: 'yes' }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when the resume belongs to another user', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'another-user',
      file_path: 'another-user/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'uploaded',
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
    expect(analyzeStoredResume).not.toHaveBeenCalled();
  });

  it('returns 200 when OCR fallback succeeds', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockResolvedValue({
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdf-ocr', usedOcr: true } } },
      matchedSkillRows: [],
      extraction: {
        method: 'pdf-ocr',
        attemptedMethods: ['pdf-direct', 'pdf-cleaned', 'pdf-token-fallback', 'pdf-ocr'],
        usedOcr: true,
        ocrConfidence: 94,
        quality: {
          confidenceScore: 82,
          confidenceTier: 'high',
          likelyScannedPdf: true,
          humanReadableRatio: 0.8,
          suspiciousTokenCount: 1,
          resumeHintCount: 7,
        },
      },
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

    expect(response.status).toBe(200);
    expect(payload.data.extraction.usedOcr).toBe(true);
  });
});
