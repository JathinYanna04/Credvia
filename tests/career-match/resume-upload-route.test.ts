import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

describe('resume upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests without a resume file', async () => {
    createServerSupabaseClient.mockResolvedValue({});
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

  it('uploads a supported resume and stores a resume row', async () => {
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
    expect(insertedResume).toMatchObject({
      user_id: 'user-1',
      file_name: 'resume.pdf',
      mime_type: 'application/pdf',
      parse_status: 'uploaded',
      is_active: true,
    });
  });
});
