import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExtractionError } from '@/lib/resume/extract';
import { ResumePersistenceError } from '@/lib/resume/persistence-error';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getResumeById = vi.fn();
const prepareResumeForAnalysis = vi.fn();
const prepareResumeFromExternalExtraction = vi.fn();
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
  prepareResumeFromExternalExtraction,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
}));

describe('resume extract route', () => {
  afterEach(() => {
    vi.unstubAllGlobals?.();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createServiceRoleClient.mockReturnValue({ __role: 'service' });
    delete process.env.RESUME_EXTRACTOR_URL;
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
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings: false,
        warningCode: null,
        warningMessage: null,
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

  it('returns 200 with warnings for borderline noisy extraction output', async () => {
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
        attemptedMethods: ['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr'],
        usedOcr: false,
        ocrAttempted: true,
        ocrImprovedQuality: false,
        ocrConfidence: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings: true,
        warningCode: 'OCR_DID_NOT_IMPROVE',
        warningMessage:
          'OCR fallback ran but did not significantly improve extraction quality. Results may be incomplete.',
        textLength: 1047,
        readiness: 'poor',
        quality: {
          textLength: 1047,
          wordCount: 145,
          confidenceScore: 44,
          confidenceTier: 'low',
          detectedSectionCount: 0,
          junkRatio: 0.3793,
          likelyScannedPdf: false,
          humanReadableRatio: 0.5103,
          suspiciousTokenCount: 55,
          resumeHintCount: 10,
        },
      },
    });

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

    expect(response.status).toBe(200);
    expect(payload.data.extracted).toBe(true);
    expect(payload.data.status).toBe('READY');
    expect(payload.data.warning).toContain('did not significantly improve');
    expect(payload.data.extraction).toMatchObject({
      acceptedWithWarnings: true,
      warningCode: 'OCR_DID_NOT_IMPROVE',
      ocrAttempted: true,
      ocrImprovedQuality: false,
      textLength: 1047,
      readiness: 'poor',
      quality: expect.objectContaining({
        confidenceTier: 'low',
        detectedSectionCount: 0,
        junkRatio: 0.3793,
        humanReadableRatio: 0.5103,
        resumeHintCount: 10,
      }),
    });
  });

  it('uses the external extractor service when RESUME_EXTRACTOR_URL is set', async () => {
    const supabase = createSupabaseMock();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        schema_version: '2.0.0',
        parser_version: 'phase2-heuristic+llm',
        request: {
          request_id: 'req-1',
          filename: 'resume.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 12,
          parsed_at: new Date().toISOString(),
        },
        status: {
          success: true,
          processing_mode: 'pdf-native',
          warnings: [],
          errors: [],
          confidence_overall: 0.86,
        },
        raw: {
          raw_text: 'raw text',
          cleaned_text: 'cleaned text',
          page_count: 1,
        },
        candidate: {
          full_name: 'Jane Builder',
          current_title: 'Product Engineer',
          email: 'jane@example.com',
          phone: '+1 555 555 1234',
          location: 'Bangalore, India',
          summary: 'Product engineer',
          linkedin: 'linkedin.com/in/jane',
          github: 'github.com/jane',
          portfolio: 'jane.dev',
        },
        sections: {
          skills: {
            languages: ['TypeScript'],
            frameworks: ['React'],
            tools: ['Docker'],
            databases: ['PostgreSQL'],
            cloud: ['AWS'],
            others: ['Product strategy'],
            spoken_languages: ['English'],
          },
          education: [],
          experience: [],
          projects: [],
          certifications: [],
          achievements: [],
          positions_of_responsibility: [],
          hackathons: ['Hackathon X'],
          publications: [],
          volunteering: [],
        },
        diagnostics: {
          method_used: 'pdf-native',
          page_methods: [{ page: '1', method: 'pdf-native' }],
          contamination_score: 20,
          salvage_score: 55,
          cleaning_actions: ['normalized_whitespace'],
          final_source: 'merged',
          llm_status: 'success',
          llm_error: null,
          llm_raw_present: true,
        },
        normalized_resume: {
          text: 'cleaned text',
          sections: {},
        },
      }),
    });

    process.env.RESUME_EXTRACTOR_URL = 'http://extractor.test';
    vi.stubGlobal('fetch', fetchMock);

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
    prepareResumeFromExternalExtraction.mockResolvedValue({
      extraction: {
        method: 'pymupdf',
        attemptedMethods: [],
        usedOcr: false,
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrConfidence: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings: true,
        warningCode: 'SALVAGED_FROM_NOISE',
        warningMessage: 'Recovered from noisy PDF',
        textLength: 1200,
        cleanedTextLength: 1200,
        contaminationScore: 20,
        salvageScore: 55,
        cleaningActions: [],
        readiness: 'partial',
        quality: {
          textLength: 1200,
          wordCount: 220,
          confidenceScore: 70,
          confidenceTier: 'medium',
          detectedSectionCount: 3,
          junkRatio: 0.1,
          likelyScannedPdf: false,
          humanReadableRatio: 0.72,
          suspiciousTokenCount: 2,
          resumeHintCount: 6,
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
    expect(fetchMock).toHaveBeenCalled();
    expect(prepareResumeFromExternalExtraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'resume-1' }),
      expect.objectContaining({
        candidate: expect.objectContaining({ current_title: 'Product Engineer' }),
        sections: expect.objectContaining({
          skills: expect.objectContaining({ spoken_languages: ['English'] }),
          hackathons: ['Hackathon X'],
        }),
        diagnostics: expect.objectContaining({ final_source: 'merged' }),
      }),
    );
    expect(payload.data.extracted).toBe(true);
  });

  it('returns 422 with diagnostics when extraction is truly unreadable', async () => {
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
        'No readable text could be extracted from this file.',
        null,
        'pdf-ocr',
        ['pdfjs-text', 'pdf-ocr'],
        'EMPTY_EXTRACTED_TEXT',
        {
          reason: 'empty text',
          attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
          method: 'pdf-ocr',
          usedOcr: true,
          ocrAttempted: true,
          ocrImprovedQuality: false,
          ocrConfidence: 42,
          textLength: 0,
          wordCount: 0,
          readiness: 'failed',
          confidenceScore: 10,
          confidenceTier: 'low',
          detectedSectionCount: 1,
          junkRatio: 0.9,
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
    expect(payload.error.code).toBe('EMPTY_EXTRACTED_TEXT');
    expect(payload.error.details).toMatchObject({
      ocrAttempted: true,
      wordCount: 0,
      detectedSectionCount: 1,
    });
    expect(payload.error.suggestedAction).toContain('Upload');
  });

  it('returns 422 with OCR_UNAVAILABLE when OCR runtime dependencies are missing', async () => {
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
        'OCR fallback is unavailable in the current runtime environment.',
        null,
        'pdfjs-text',
        ['pdfjs-text', 'pdf-ocr'],
        'OCR_UNAVAILABLE',
        {
          reason: 'OCR runtime dependencies are unavailable in this deployment environment.',
          attemptedMethods: ['pdfjs-text', 'pdf-ocr'],
          method: 'pdfjs-text',
          usedOcr: false,
          ocrAttempted: true,
          ocrImprovedQuality: null,
          ocrConfidence: null,
          ocrAvailable: false,
          ocrUnavailableReason:
            'OCR canvas runtime is missing (@napi-rs/canvas is unavailable).',
          textLength: 140,
          wordCount: 24,
          readiness: 'failed',
          confidenceScore: 28,
          confidenceTier: 'low',
          detectedSectionCount: 1,
          junkRatio: 0.4,
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
    expect(payload.error.code).toBe('OCR_UNAVAILABLE');
    expect(payload.error.details).toMatchObject({
      ocrAttempted: true,
      ocrAvailable: false,
    });
    expect(payload.error.suggestedAction).toContain('Install OCR runtime dependencies');
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
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings: false,
        warningCode: null,
        warningMessage: null,
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
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings: false,
        warningCode: null,
        warningMessage: null,
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
