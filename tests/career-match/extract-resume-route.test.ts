import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeExtractionError } from '@/lib/resume/extract';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getResumeById = vi.fn();
const prepareResumeForAnalysis = vi.fn();
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

vi.mock('@/lib/analytics/capture-server-event', () => ({
  captureServerEvent,
}));

describe('resume extract route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
