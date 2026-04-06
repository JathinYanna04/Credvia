import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const toPostSummaries = vi.fn();
const sanitizeHtml = vi.fn((value: string) => `<p>${value}</p>`);

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/supabase/helpers", () => ({
  getRequiredUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/supabase/query-helpers", () => ({
  toPostSummaries,
}));

vi.mock("@/lib/utils/sanitize", () => ({
  sanitizeHtml,
}));

vi.mock("@/lib/utils/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe("startup idea create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a post row and startup idea row from the nested startup_idea payload", async () => {
    let insertedPost: Record<string, unknown> | null = null;
    let insertedIdea: Record<string, unknown> | null = null;
    let insertedRevision: Record<string, unknown> | null = null;
    let startupIdeaUpdate: Record<string, unknown> | null = null;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "posts") {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPost = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        id: "idea-post-1",
                        title: payload.title,
                        body_md: payload.body_md,
                        post_type: payload.post_type,
                        community_id: payload.community_id,
                        author_id: payload.author_id,
                        vote_score: 0,
                        comment_count: 0,
                        save_count: 0,
                        created_at: "2026-03-29T00:00:00.000Z",
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "startup_ideas") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              insertedIdea = payload;
              return { error: null };
            },
            update(payload: Record<string, unknown>) {
              startupIdeaUpdate = payload;
              return {
                eq: async () => ({ error: null }),
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "startup_idea_revisions") {
          return {
            insert(payload: Record<string, unknown>) {
              insertedRevision = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: "revision-1" },
                      error: null,
                    }),
                  };
                },
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: "founder-1" });
    enforceRateLimit.mockResolvedValue({ success: true });
    toPostSummaries.mockResolvedValue([
      {
        id: "idea-post-1",
        title: "Idea title",
      },
    ]);

    const { POST } = await import("@/app/api/v1/posts/route");

    const response = await POST(
      new Request("http://localhost:3000/api/v1/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Idea title",
          post_type: "startup_idea",
          community_id: "community-1",
          body_md: "Idea body",
          startup_idea: {
            problem:
              "Founders need structured validation before they commit serious build time.",
            target_audience:
              "Student founders and solo builders validating startup concepts.",
            solution:
              "A startup idea workflow with comments and traction signals.",
            market_category: "devtools",
            stage: "idea",
            monetization_model: "subscription",
          },
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("idea-post-1");
    expect(insertedPost).toMatchObject({
      title: "Idea title",
      post_type: "startup_idea",
      community_id: "community-1",
      author_id: "founder-1",
      body_html: "<p>Idea body</p>",
    });
    expect(insertedIdea).toMatchObject({
      post_id: "idea-post-1",
      founder_user_id: "founder-1",
      problem:
        "Founders need structured validation before they commit serious build time.",
      target_audience:
        "Student founders and solo builders validating startup concepts.",
      solution: "A startup idea workflow with comments and traction signals.",
      market_category: "devtools",
      stage: "idea",
      monetization_model: "subscription",
    });
    expect(insertedRevision).toMatchObject({
      post_id: "idea-post-1",
      revision_number: 1,
      title: "Idea title",
      body_md: "Idea body",
      problem:
        "Founders need structured validation before they commit serious build time.",
      target_audience:
        "Student founders and solo builders validating startup concepts.",
      solution: "A startup idea workflow with comments and traction signals.",
      market_category: "devtools",
      stage: "idea",
      monetization_model: "subscription",
      change_summary: "Initial thesis snapshot",
      created_by: "founder-1",
    });
    expect(startupIdeaUpdate).toMatchObject({
      current_revision_id: "revision-1",
    });
  });

  it("builds a structured startup idea body and uploads optional supporting evidence files", async () => {
    let insertedPost: Record<string, unknown> | null = null;
    let updatedPost: Record<string, unknown> | null = null;
    let insertedRevision: Record<string, unknown> | null = null;
    const uploadedPaths: string[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "posts") {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPost = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        id: "idea-post-2",
                        title: payload.title,
                        body_md: payload.body_md,
                        body_html: payload.body_html,
                        post_type: payload.post_type,
                        community_id: payload.community_id,
                        author_id: payload.author_id,
                        vote_score: 0,
                        comment_count: 0,
                        save_count: 0,
                        created_at: "2026-03-29T00:00:00.000Z",
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(payload: Record<string, unknown>) {
              updatedPost = payload;
              return {
                eq: async () => ({ error: null }),
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "startup_ideas") {
          return {
            insert: async () => ({ error: null }),
            update() {
              return {
                eq: async () => ({ error: null }),
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "startup_idea_revisions") {
          return {
            insert(payload: Record<string, unknown>) {
              insertedRevision = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: "revision-2" },
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
          upload: async (path: string) => {
            uploadedPaths.push(path);
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.example.com/${path}` },
          }),
          remove: async () => ({ error: null }),
        })),
      },
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: "founder-2" });
    enforceRateLimit.mockResolvedValue({ success: true });
    toPostSummaries.mockResolvedValue([
      {
        id: "idea-post-2",
        title: "Validation workspace",
      },
    ]);

    const { POST } = await import("@/app/api/v1/posts/route");
    const formData = new FormData();
    formData.append("title", "Validation workspace");
    formData.append("post_type", "startup_idea");
    formData.append("community_id", "community-1");
    formData.append(
      "startup_idea.problem",
      "Founders struggle to keep validation evidence, notes, and next steps in one place.",
    );
    formData.append(
      "startup_idea.target_audience",
      "Student founders and solo builders validating new startup concepts.",
    );
    formData.append(
      "startup_idea.solution",
      "A structured validation workspace that captures interviews, traction signals, and decisions.",
    );
    formData.append("startup_idea.market_category", "AI/ML");
    formData.append("startup_idea.stage", "problem_validation");
    formData.append(
      "startup_idea.existing_alternatives",
      "Spreadsheets, notion docs, and scattered founder chat screenshots.",
    );
    formData.append(
      "startup_idea.differentiation",
      "It keeps evidence, discussion, and iteration history visible in one shared workflow.",
    );
    formData.append(
      "startup_idea.evidence_of_problem",
      "Ten founder interviews showed repeated context loss and duplicated validation work.",
    );
    formData.append(
      "startup_idea.biggest_risk_assumption",
      "Founders may not consistently update their validation trail after the first week.",
    );
    formData.append("startup_idea.monetization_model", "subscription");
    formData.append(
      "startup_idea.supporting_evidence_links",
      "https://github.com/example/demo\nhttps://figma.com/file/example",
    );
    formData.append(
      "startup_idea.supporting_evidence_files",
      new File(["evidence"], "validation-proof.pdf", {
        type: "application/pdf",
      }),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/v1/posts", {
        method: "POST",
        body: formData,
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("idea-post-2");
    expect(insertedPost).toMatchObject({
      title: "Validation workspace",
      post_type: "startup_idea",
      community_id: "community-1",
      author_id: "founder-2",
    });
    expect(updatedPost).toMatchObject({
      body_md: expect.stringContaining("## Supporting Evidence (Optional)"),
      body_html: expect.stringContaining("https://cdn.example.com/"),
    });
    expect(insertedRevision).toMatchObject({
      title: "Validation workspace",
      stage: "problem_validation",
      body_md: expect.stringContaining("## Problem Statement"),
    });
    expect(insertedRevision).toMatchObject({
      body_md: expect.stringContaining("https://github.com/example/demo"),
    });
    expect(uploadedPaths).toHaveLength(1);
  });
});
