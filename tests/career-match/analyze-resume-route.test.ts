import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeResumeResponse, ResumeExtractionErrorDetails } from '@/lib/types';
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
  existingResume?: { id: string; user_id: string } | null;
}) {
  const latestRun = options?.latestRun ?? null;
  const latestRunError = options?.latestRunError ?? null;
  const downloadError = options?.downloadError ?? null;
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

  it('succeeds with an empty body and recomputes matches for the active resume', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    analyzeStoredResume.mockResolvedValue({
      extraction: {
        method: 'pdfjs-text',
        attemptedMethods: ['pdfjs-text'],
        usedOcr: false,
        ocrConfidence: null,
        quality: {
          confidenceScore: 92,
          confidenceTier: 'high',
          likelyScannedPdf: false,
          humanReadableRatio: 0.91,
          suspiciousTokenCount: 0,
          resumeHintCount: 7,
        },
      },
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdfjs-text', usedOcr: false } } },
      matchedSkillRows: [],
    });
    recomputeMatchesForResume.mockResolvedValue(12);

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = (await response.json()) as { data: AnalyzeResumeResponse };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      analyzed: true,
      resumeId: 'resume-1',
      extraction: {
        method: 'pdfjs-text',
        attemptedMethods: ['pdfjs-text'],
        usedOcr: false,
      },
      warning: null,
    });
    expect(analyzeStoredResume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      {},
    );
    expect(recomputeMatchesForResume).toHaveBeenCalledWith(supabase, 'user-1', 'resume-1');
  });

  it('rejects an invalid analyze request body with a 400 validation error', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

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
    expect(payload.error.message).toContain('boolean');
    expect(getOwnedResume).not.toHaveBeenCalled();
    expect(analyzeStoredResume).not.toHaveBeenCalled();
  });

  it('returns 403 when the resume exists but belongs to another user', async () => {
    const supabase = createSupabaseMock({
      existingResume: { id: 'resume-1', user_id: 'someone-else' },
    });

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getOwnedResume.mockResolvedValue(null);

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
    expect(payload.error).toEqual({
      code: 'FORBIDDEN',
      message: 'You do not have access to this resume.',
    });
    expect(analyzeStoredResume).not.toHaveBeenCalled();
  });

  it('returns IMAGE_BASED_PDF when extraction indicates a scanned/image-based PDF', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    const details: ResumeExtractionErrorDetails = {
      reason: 'This PDF looks image-based or too low-quality for reliable text extraction.',
      attemptedMethods: ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
      method: 'pdf-ocr',
      usedOcr: true,
      ocrAttempted: true,
      ocrImprovedQuality: false,
      ocrConfidence: 28,
      textLength: 94,
      readiness: 'failed',
      confidenceScore: 24,
      confidenceTier: 'low',
      likelyScannedPdf: true,
    };
    analyzeStoredResume.mockRejectedValue(
      new ResumeExtractionError(
        'This PDF looks image-based or too low-quality for reliable text extraction.',
        null,
        'pdf-ocr',
        ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
        'IMAGE_BASED_PDF',
        details as any,
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
    expect(payload.error.code).toBe('IMAGE_BASED_PDF');
    expect(payload.error.details).toMatchObject({
      ocrAttempted: true,
      ocrImprovedQuality: false,
      likelyScannedPdf: true,
      method: 'pdf-ocr',
    });
    expect(recomputeMatchesForResume).not.toHaveBeenCalled();
  });

  it('returns LOW_TEXT_CONFIDENCE when OCR is attempted but extraction quality is still poor', async () => {
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
      parse_status: 'uploaded',
    });

    const details: ResumeExtractionErrorDetails = {
      reason: 'Extracted text is not human-readable enough to trust for resume parsing.',
      attemptedMethods: ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
      method: 'pdf-ocr',
      usedOcr: true,
      ocrAttempted: true,
      ocrImprovedQuality: false,
      ocrConfidence: 41,
      textLength: 132,
      readiness: 'poor',
      confidenceScore: 39,
      confidenceTier: 'low',
      likelyScannedPdf: false,
    };
    analyzeStoredResume.mockRejectedValue(
      new ResumeExtractionError(
        'Extracted text is not human-readable enough to trust for resume parsing.',
        null,
        'pdf-ocr',
        ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
        'LOW_TEXT_CONFIDENCE',
        details as any,
      ),
    );

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
    expect(payload.error.code).toBe('LOW_TEXT_CONFIDENCE');
    expect(payload.error.details).toMatchObject({
      ocrAttempted: true,
      ocrImprovedQuality: false,
      textLength: 132,
      confidenceTier: 'low',
    });
  });

  it('returns EMPTY_EXTRACTED_TEXT when all methods recover no text', async () => {
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
      parse_status: 'uploaded',
    });

    const details: ResumeExtractionErrorDetails = {
      reason: 'No readable text could be extracted from this file.',
      attemptedMethods: ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
      method: 'pdf-ocr',
      usedOcr: true,
      ocrAttempted: true,
      ocrImprovedQuality: false,
      ocrConfidence: 11,
      textLength: 0,
      readiness: 'failed',
      confidenceScore: 0,
      confidenceTier: 'low',
      likelyScannedPdf: true,
    };
    analyzeStoredResume.mockRejectedValue(
      new ResumeExtractionError(
        'No readable text could be extracted from this file.',
        null,
        'pdf-ocr',
        ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
        'EMPTY_EXTRACTED_TEXT',
        details as any,
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
    expect(payload.error.code).toBe('EMPTY_EXTRACTED_TEXT');
    expect(payload.error.details).toMatchObject({ textLength: 0, readiness: 'failed' });
  });

  it('returns 409 when analysis is already in progress', async () => {
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
    getOwnedResume.mockResolvedValue({
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
    expect(payload.error).toEqual({
      code: 'ANALYSIS_IN_PROGRESS',
      message: 'Resume analysis is already running.',
    });
    expect(analyzeStoredResume).not.toHaveBeenCalled();
    expect(recomputeMatchesForResume).not.toHaveBeenCalled();
  });

  it('returns 404 when the resume does not exist', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getOwnedResume.mockResolvedValue(null);

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

    expect(response.status).toBe(404);
    expect(payload.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Resume not found.',
    });
    expect(analyzeStoredResume).not.toHaveBeenCalled();
  });

  it('returns 422 RESUME_FILE_MISSING when storage download fails', async () => {
    const supabase = createSupabaseMock({
      downloadError: { message: 'Object not found' },
    });

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getOwnedResume.mockResolvedValue({
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
    expect(payload.error).toEqual({
      code: 'RESUME_FILE_MISSING',
      message: 'Upload a resume file before analysis.',
    });
    expect(analyzeStoredResume).not.toHaveBeenCalled();
    expect(recomputeMatchesForResume).not.toHaveBeenCalled();
  });

  it('passes forceOCR through and succeeds when fallback extraction wins', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue(null);
    analyzeStoredResume.mockResolvedValue({
      extraction: {
        method: 'pdf-ocr',
        attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
        usedOcr: true,
        ocrConfidence: 91,
        quality: {
          confidenceScore: 68,
          confidenceTier: 'medium',
          likelyScannedPdf: true,
          humanReadableRatio: 0.72,
          suspiciousTokenCount: 1,
          resumeHintCount: 5,
        },
      },
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdf-ocr', usedOcr: true } } },
      matchedSkillRows: [],
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

    const payload = (await response.json()) as { data: AnalyzeResumeResponse };

    expect(response.status).toBe(200);
    expect(analyzeStoredResume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      expect.objectContaining({ forceOCR: true }),
    );
    expect(payload.data).toMatchObject({
      analyzed: true,
      extraction: {
        method: 'pdf-ocr',
        usedOcr: true,
        attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
      },
      warning: 'We analyzed your resume, but the text quality was limited. For best results, upload a text-based PDF.',
    });
  });

  it('accepts legacy forceOcr and normalizes it to forceOCR', async () => {
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
      parse_status: 'uploaded',
    });
    getActiveResume.mockResolvedValue(null);
    analyzeStoredResume.mockResolvedValue({
      extraction: {
        method: 'pdf-ocr',
        attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
        usedOcr: true,
        ocrConfidence: 87,
        quality: {
          confidenceScore: 66,
          confidenceTier: 'medium',
          likelyScannedPdf: true,
          humanReadableRatio: 0.69,
          suspiciousTokenCount: 2,
          resumeHintCount: 4,
        },
      },
      parsed: { parsedSections: { __meta: { extractionMethod: 'pdf-ocr', usedOcr: true } } },
      matchedSkillRows: [],
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/analyze/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceOcr: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    expect(response.status).toBe(200);
    expect(analyzeStoredResume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      expect.objectContaining({ forceOCR: true }),
    );
  });
});
