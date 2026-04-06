import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/supabase/helpers", () => ({
  getRequiredUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit,
}));

describe("comment vote route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a comment vote and rate-limits per comment id", async () => {
    let insertedVote: Record<string, unknown> | null = null;

    const commentLookup = {
      select: vi.fn(() => commentLookup),
      eq: vi.fn(() => commentLookup),
      maybeSingle: vi.fn(async () => ({
        data: { id: "comment-1" },
        error: null,
      })),
      single: vi.fn(async () => ({ data: { vote_score: 1 }, error: null })),
    };

    const voteLookup = {
      select: vi.fn(() => voteLookup),
      eq: vi.fn(() => voteLookup),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        insertedVote = payload;
        return { error: null };
      }),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "comments") return commentLookup;
        if (table === "votes") return voteLookup;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: "user-1" });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import("@/app/api/v1/comments/[id]/vote/route");

    const response = await POST(
      new Request("http://localhost:3000/api/v1/comments/comment-1/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: 1 }),
      }),
      { params: { id: "comment-1" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.score).toBe(1);
    expect(insertedVote).toMatchObject({
      user_id: "user-1",
      entity_type: "comment",
      entity_id: "comment-1",
      value: 1,
    });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      "vote",
      "user-1:comment:comment-1",
    );
  });
});
