import { describe, expect, it } from "vitest";

import { toPostSummaries } from "@/lib/supabase/query-helpers";

describe("toPostSummaries", () => {
  it("includes the signed-in viewer vote for posts", async () => {
    const supabase = {
      from(table: string) {
        if (table === "profiles") {
          const chain = {
            select: () => chain,
            in: async () => ({ data: [], error: null }),
          };

          return chain;
        }

        if (table === "communities") {
          const chain = {
            select: () => chain,
            in: async () => ({
              data: [
                {
                  id: "community-1",
                  name: "Startups",
                  slug: "startups",
                  description: "",
                  member_count: 1,
                  post_count: 1,
                },
              ],
              error: null,
            }),
          };

          return chain;
        }

        if (table === "community_reputation") {
          let inCount = 0;
          const chain = {
            select: () => chain,
            in: () => {
              inCount += 1;
              if (inCount === 2) {
                return Promise.resolve({ data: [], error: null });
              }
              return chain;
            },
          };

          return chain;
        }

        if (table === "startup_ideas") {
          const chain = {
            select: () => chain,
            in: async () => ({
              data: [
                {
                  post_id: "post-1",
                  founder_user_id: "user-1",
                  problem: "Problem statement for founders validating ideas.",
                  target_audience: "Student founders",
                  solution: "Solution overview",
                  market_category: "AI/ML",
                  stage: "idea",
                  monetization_model: "subscription",
                  current_revision_id: null,
                  revision_count: 1,
                  follower_count: 0,
                  last_revision_at: null,
                },
              ],
              error: null,
            }),
          };

          return chain;
        }

        if (table === "comments") {
          const chain = {
            select: () => chain,
            in: () => chain,
            eq: async () => ({
              data: [{ post_id: "post-1", author_id: "commenter-1" }],
              error: null,
            }),
          };

          return chain;
        }

        if (table === "votes") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            in: async () => ({
              data: [
                {
                  id: "vote-1",
                  user_id: "viewer-1",
                  entity_type: "post",
                  entity_id: "post-1",
                  value: 1,
                },
              ],
              error: null,
            }),
          };

          return chain;
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    } as never;

    const [summary] = await toPostSummaries(
      supabase,
      [
        {
          id: "post-1",
          title: "Idea title",
          body_md: "Idea body",
          created_at: "2026-04-04T00:00:00.000Z",
          post_type: "startup_idea",
          vote_score: 3,
          comment_count: 1,
          save_count: 0,
          author_id: "user-1",
          community_id: "community-1",
          external_url: null,
          status: "published",
        },
      ] as never,
      "viewer-1",
    );

    expect(summary).toBeDefined();
    expect(summary?.currentUserVote).toBe(1);
    expect(summary?.upvoteCount).toBe(1);
    expect(summary?.downvoteCount).toBe(0);
    expect(summary?.voteScore).toBe(3);
  });
});
