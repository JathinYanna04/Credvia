import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const sendNotification = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/supabase/helpers", () => ({
  getRequiredUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/supabase/notifications", () => ({
  sendNotification,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

describe("startup idea vote route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a post vote and returns the refreshed score", async () => {
    const postLookup = {
      select: vi.fn(() => postLookup),
      eq: vi.fn(() => postLookup),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'idea-1',
          author_id: 'author-1',
          title: 'Idea title',
          community_id: 'community-1',
        },
        error: null,
      })),
    };

    const supabase = {
      rpc: vi.fn((fn: string) => {
        if (fn !== "mutate_post_vote_atomic") {
          return {
            single: async () => ({
              data: null,
              error: { message: `Unexpected function: ${fn}` },
            }),
          };
        }

        return {
          single: async () => ({
            data: {
              entity_id: "idea-1",
              previous_vote: 0,
              current_user_vote: 1,
              score: 1,
              upvote_count: 1,
              downvote_count: 0,
              updated_at: "2026-04-06T10:00:00.000Z",
              contribution_delta: 1,
            },
            error: null,
          }),
        };
      }),
      from: vi.fn((table: string) => {
        if (table === "posts") return postLookup;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: "user-1" });
    enforceRateLimit.mockResolvedValue({ success: true });
    createServiceRoleClient.mockReturnValue(null);

    const { POST } = await import("@/app/api/v1/posts/[id]/vote/route");

    const response = await POST(
      new Request("http://localhost:3000/api/v1/posts/idea-1/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: 'up' }),
      }),
      { params: { id: "idea-1" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.score).toBe(1);
    expect(payload.data.userVote).toBe('up');
    expect(payload.data.currentUserVote).toBe(1);
    expect(payload.data.updatedAt).toBe("2026-04-06T10:00:00.000Z");
    expect(enforceRateLimit).toHaveBeenCalledWith("vote", "user-1:post:idea-1");
  });
});
