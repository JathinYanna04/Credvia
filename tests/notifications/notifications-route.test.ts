import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const toNotificationSummaries = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  toNotificationSummaries,
}));

describe('notifications route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists notifications for the signed-in user', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({
        data: [{ id: 'notification-1' }],
        error: null,
      })),
    };

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    toNotificationSummaries.mockResolvedValue([{ id: 'notification-1', description: 'updated your post' }]);

    const { GET } = await import('@/app/api/v1/notifications/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
  });

  it('marks unread notifications as read', async () => {
    const updateEq = vi.fn(() => ({
      is: vi.fn(async () => ({ error: null })),
    }));

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: updateEq,
        })),
      })),
    });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { PATCH } = await import('@/app/api/v1/notifications/route');
    const response = await PATCH();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ markedRead: true });
  });
});
