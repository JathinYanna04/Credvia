import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const prepareResumeForAnalysis = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/resume/analyze', () => ({
  prepareResumeForAnalysis,
}));

describe('resume upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareResumeForAnalysis.mockResolvedValue(undefined);
  });

  function createSupabaseMock() {
    let insertedResume: Record<string, unknown> | null = null;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'resumes') {
          return {
            update() {
              return {
                eq() {
                  return {
                    eq: async () => ({ error: null }),
                  };
                },
              };
            },
            insert(payload: Record<string, unknown>) {
              insertedResume = payload;
              return {
                select() {
                  return {
                    single: async () => ({ data: { ...payload }, error: null }),
                  };
                },
              };
            },
            select() {
              return {
                eq() {
                  return {
                    single: async () => ({ data: { ...(insertedResume ?? {}) }, error: null }),
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
          upload: async () => ({ error: null }),
        })),
      },
    };

    return { supabase, getInsertedResume: () => insertedResume };
  }

  it('rejects requests without a resume file', async () => {
    const { supabase } = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/resumes/route');
    const formData = new FormData();

    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
  });

  it('uploads a PDF resume and stores lifecycle status as UPLOADED', async () => {
    const { supabase, getInsertedResume } = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/resumes/route');
    const formData = new FormData();
    formData.set(
      'resume',
      new File(['Resume body'], 'resume.pdf', { type: 'application/pdf' }),
    );

    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes', {
        method: 'POST',
        body: formData,
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.user_id).toBe('user-1');
    expect(getInsertedResume()).toMatchObject({
      user_id: 'user-1',
      file_name: 'resume.pdf',
      mime_type: 'application/pdf',
      parse_status: 'UPLOADED',
      is_active: true,
    });
    expect(prepareResumeForAnalysis).toHaveBeenCalled();
  });

  it('accepts text and image resume formats', async () => {
    const { supabase } = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/resumes/route');

    const txtRequest = new Request('http://localhost:3000/api/v1/resumes', {
      method: 'POST',
      body: (() => {
        const formData = new FormData();
        formData.set('resume', new File(['Jane Doe\nSkills: React'], 'resume.txt', { type: 'text/plain' }));
        return formData;
      })(),
    });

    const imageRequest = new Request('http://localhost:3000/api/v1/resumes', {
      method: 'POST',
      body: (() => {
        const formData = new FormData();
        formData.set('resume', new File(['binary'], 'resume.png', { type: 'image/png' }));
        return formData;
      })(),
    });

    const txtResponse = await POST(txtRequest);
    const imageResponse = await POST(imageRequest);

    expect(txtResponse.status).toBe(200);
    expect(imageResponse.status).toBe(200);
  });

  it('rejects legacy DOC files with a clear unsupported-format error', async () => {
    const { supabase } = createSupabaseMock();

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/resumes/route');
    const formData = new FormData();
    formData.set('resume', new File(['legacy-doc'], 'resume.doc', { type: 'application/msword' }));

    const response = await POST(
      new Request('http://localhost:3000/api/v1/resumes', {
        method: 'POST',
        body: formData,
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('UNSUPPORTED_RESUME_FORMAT');
    expect(payload.error.message).toContain('Legacy DOC');
  });
});
