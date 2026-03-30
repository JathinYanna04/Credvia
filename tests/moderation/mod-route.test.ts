import { beforeEach, describe, expect, it, vi } from 'vitest';

const getModerationQueue = vi.fn();
const getModerationActions = vi.fn();
const applyModerationAction = vi.fn();

vi.mock('@/lib/supabase/moderation', () => ({
  getModerationQueue,
  getModerationActions,
  applyModerationAction,
}));

describe('moderation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns reports and actions for moderator views', async () => {
    getModerationQueue.mockResolvedValue([{ id: 'report-1' }]);
    getModerationActions.mockResolvedValue([{ id: 'action-1' }]);

    const { GET } = await import('@/app/api/v1/mod/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      reports: [{ id: 'report-1' }],
      actions: [{ id: 'action-1' }],
    });
  });

  it('applies a moderation action', async () => {
    applyModerationAction.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/v1/mod/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/mod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: '32f24aa3-441a-4f60-a9f9-2da20d0c8a3e',
          action: 'hide',
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(applyModerationAction).toHaveBeenCalledWith({
      reportId: '32f24aa3-441a-4f60-a9f9-2da20d0c8a3e',
      action: 'hide',
    });
    expect(payload.data).toEqual({ success: true });
  });
});
