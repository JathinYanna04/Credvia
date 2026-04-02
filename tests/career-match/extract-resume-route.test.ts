import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExtractionError } from '@/lib/resume/extract';
import { ResumePersistenceError } from '@/lib/resume/persistence-error';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getResumeById = vi.fn();
const prepareResumeForAnalysis = vi.fn();
const createServiceRoleClient = vi.fn();
const captureServerEvent = vi.fn();

function createSupabaseMock(options?: {
  downloadError?: { message: string } | null;
}) {
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

      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        download: async () => ({
          data: downloadError ? null : new Blob(['resume body']),
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
}));

vi.mock('@/lib/resume/analyze', () => ({
  prepareResumeForAnalysis,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
}));

describe('resume extract route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceRoleClient.mockReturnValue({ __role: 'service' });
  });

  it('extracts and prepares resume successfully', async () => {
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
    prepareResumeForAnalysis.mockResolvedValue({
      extraction: {
        method: 'pdfjs-text',
        attemptedMethods: ['pdfjs-text'],
        usedOcr: false,
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrConfidence: null,
        textLength: 1200,
        readiness: 'good',
        quality: {
          textLength: 1200,
          wordCount: 220,
          confidenceScore: 88,
          confidenceTier: 'high',
          detectedSectionCount: 4,
          junkRatio: 0.02,
          likelyScannedPdf: false,
          humanReadableRatio: 0.92,
          suspiciousTokenCount: 0,
          resumeHintCount: 8,
        },
      },
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.extracted).toBe(true);
    expect(payload.data.status).toBe('READY');
    expect(prepareResumeForAnalysis).toHaveBeenCalled();
  });

  it('returns 422 with diagnostics when extraction fails with low confidence', async () => {
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
    prepareResumeForAnalysis.mockRejectedValue(
      new ResumeExtractionError(
        'Extracted text quality is too low to trust for resume parsing.',
        null,
        'pdf-ocr',
        ['pdfjs-text', 'pdf-ocr'],
        'LOW_TEXT_CONFIDENCE',
        {
          reason: 'low confidence',
          attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
          method: 'pdf-ocr',
          usedOcr: true,
          ocrAttempted: true,
          ocrImprovedQuality: false,
          ocrConfidence: 42,
          textLength: 120,
          wordCount: 15,
          readiness: 'poor',
          confidenceScore: 39,
          confidenceTier: 'low',
          detectedSectionCount: 1,
          junkRatio: 0.35,
          likelyScannedPdf: true,
        },
      ),
    );

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
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
      wordCount: 15,
      detectedSectionCount: 1,
    });
    expect(payload.error.suggestedAction).toContain('Upload');
  });

  it('supports forceOcr alias compatibility', async () => {
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
    prepareResumeForAnalysis.mockResolvedValue({
      extraction: {
        method: 'pdf-ocr',
        attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
        usedOcr: true,
        ocrAttempted: true,
        ocrImprovedQuality: true,
        ocrConfidence: 90,
        textLength: 1000,
        readiness: 'good',
        quality: {
          textLength: 1000,
          wordCount: 180,
          confidenceScore: 82,
          confidenceTier: 'high',
          detectedSectionCount: 4,
          junkRatio: 0.04,
          likelyScannedPdf: false,
          humanReadableRatio: 0.85,
          suspiciousTokenCount: 1,
          resumeHintCount: 7,
        },
      },
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceOcr: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    expect(response.status).toBe(200);
    expect(prepareResumeForAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      expect.objectContaining({ forceOCR: true }),
    );
  });

  it('uses service-role client for orchestration writes after ownership check', async () => {
    const supabase = createSupabaseMock();
    const serviceRoleSupabase = { __role: 'service' };

    createServerSupabaseClient.mockResolvedValue(supabase);
    createServiceRoleClient.mockReturnValue(serviceRoleSupabase);
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
    prepareResumeForAnalysis.mockResolvedValue({
      extraction: {
        method: 'pdfjs-text',
        attemptedMethods: ['pdfjs-text'],
        usedOcr: false,
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrConfidence: null,
        textLength: 1200,
        readiness: 'good',
        quality: {
          textLength: 1200,
          wordCount: 220,
          confidenceScore: 88,
          confidenceTier: 'high',
          detectedSectionCount: 4,
          junkRatio: 0.02,
          likelyScannedPdf: false,
          humanReadableRatio: 0.92,
          suspiciousTokenCount: 0,
          resumeHintCount: 8,
        },
      },
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    expect(prepareResumeForAnalysis).toHaveBeenCalledWith(
      serviceRoleSupabase,
      expect.objectContaining({ id: 'resume-1' }),
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('returns 403 and never invokes orchestration when resume is owned by another user', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    createServiceRoleClient.mockReturnValue({ __role: 'service' });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getResumeById.mockResolvedValue({
      id: 'resume-1',
      user_id: 'user-2',
      file_path: 'user-2/resume-1/original.pdf',
      mime_type: 'application/pdf',
      file_name: 'resume.pdf',
      parse_status: 'UPLOADED',
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(prepareResumeForAnalysis).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns 409 when extraction is already in progress', async () => {
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
      parse_status: 'EXTRACTING',
    });

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry: true }),
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('ANALYSIS_IN_PROGRESS');
    expect(prepareResumeForAnalysis).not.toHaveBeenCalled();
  });

  it('returns 422 when storage object is missing', async () => {
    const supabase = createSupabaseMock({ downloadError: { message: 'Object not found' } });

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

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('RESUME_FILE_MISSING');
    expect(payload.error.suggestedAction).toContain('Re-upload');
    expect(prepareResumeForAnalysis).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON body', async () => {
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

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"forceOCR":true',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns actionable 500 details on lifecycle persistence failure', async () => {
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
    prepareResumeForAnalysis.mockRejectedValue(
      new ResumePersistenceError(
        'Failed to persist resume lifecycle status.',
        {
          operation: 'update-parse-status',
          table: 'resumes',
          resumeId: 'resume-1',
          targetStatus: 'EXTRACTING',
        },
        {
          message: 'new row for relation "resumes" violates check constraint',
          code: '23514',
          details: 'Failing row contains parse_status=EXTRACTING',
          hint: null,
        },
      ),
    );

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('INTERNAL_ERROR');
    expect(payload.error.details).toMatchObject({
      operation: 'update-parse-status',
      dbCode: '23514',
      targetStatus: 'EXTRACTING',
    });
    expect(payload.error.suggestedAction).toContain('migration');
  });

  it('returns RESUME_ANALYSIS_RUNS_RLS_BLOCKED for analysis-run RLS violations', async () => {
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
    prepareResumeForAnalysis.mockRejectedValue(
      new ResumePersistenceError(
        'Could not create resume analysis run.',
        {
          operation: 'insert-analysis-run',
          table: 'resume_analysis_runs',
          resumeId: 'resume-1',
          targetStatus: 'extracting',
        },
        {
          message:
            'new row violates row-level security policy for table "resume_analysis_runs"',
          code: '42501',
          details: null,
          hint: null,
        },
      ),
    );

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('RESUME_ANALYSIS_RUNS_RLS_BLOCKED');
    expect(payload.error.details).toMatchObject({
      table: 'resume_analysis_runs',
      operation: 'insert-analysis-run',
      dbCode: '42501',
    });
  });

  it('returns ANALYSIS_SERVICE_UNAVAILABLE when service-role client is not configured', async () => {
    const supabase = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    createServiceRoleClient.mockReturnValue(null);
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

    const { POST } = await import('@/app/api/v1/resumes/[id]/extract/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes/resume-1/extract', {
        method: 'POST',
      }),
      { params: { id: 'resume-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('ANALYSIS_SERVICE_UNAVAILABLE');
    expect(payload.error.details).toMatchObject({
      operation: 'resolve-orchestration-client',
      table: 'resume_analysis_runs',
      dbCode: 'CONFIG_MISSING',
    });
  });
});
