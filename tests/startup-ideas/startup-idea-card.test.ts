import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StartupIdeaCard } from "@/components/startup-ideas/StartupIdeaCard";
import type { PostSummary } from "@/lib/types";

(globalThis as { React?: typeof React }).React = React;

const baseIdea: PostSummary = {
  id: "idea-1",
  title: "Startup validation 1774798703978",
  body: "Founders need better validation workflows.",
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z",
  postType: "startup_idea",
  voteScore: 9,
  currentUserVote: 1,
  commentCount: 1,
  saveCount: 0,
  author: {
    id: "user-1",
    username: "founder",
    fullName: "Founder One",
    headline: "",
    avatarUrl: "",
    skills: [],
    reputation: [],
  },
  community: {
    id: "community-1",
    name: "Startups",
    slug: "startups",
    description: "",
    icon: "ST",
    memberCount: 10,
    postCount: 5,
    accent: "var(--accent)",
  },
  tags: [],
  startupIdea: {
    problem:
      "Founders waste time validating ideas across scattered docs, calls, and spreadsheets.",
    targetAudience: "Early-stage founders and solo builders.",
    solution:
      "A shared workspace that captures validation evidence, contributor feedback, and next decisions.",
    marketCategory: "AI/ML",
    stage: "idea",
    monetizationModel: "subscription",
    validationScore: 9,
    uniqueCommenters: 1,
    followerCount: 0,
    revisionCount: 1,
  },
};

describe("StartupIdeaCard", () => {
  it("cleans titles and shows numeric community validation when engagement data exists", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StartupIdeaCard, { idea: baseIdea }),
    );

    expect(markup).toContain("Startup validation");
    expect(markup).not.toContain("1774798703978");
    expect(markup).toContain("Community validation: 9/10");
    expect(markup).toContain("1 comment");
    expect(markup).toContain("1 contributor");
    expect(markup).toContain("1 update");
    expect(markup).toContain("0 followers");
  });

  it("shows pending community validation when there are no community signals", () => {
    const pendingIdea: PostSummary = {
      ...baseIdea,
      voteScore: 0,
      commentCount: 0,
      saveCount: 0,
      startupIdea: {
        ...baseIdea.startupIdea!,
        validationScore: 0,
        uniqueCommenters: 0,
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(StartupIdeaCard, { idea: pendingIdea }),
    );

    expect(markup).toContain("Community validation pending");
    expect(markup).not.toContain("AI assessment:");
  });

  it("shows a separate AI assessment badge when AI feedback exists", () => {
    const aiReviewedIdea: PostSummary = {
      ...baseIdea,
      voteScore: 0,
      commentCount: 0,
      saveCount: 0,
      startupIdea: {
        ...baseIdea.startupIdea!,
        validationScore: 0,
        uniqueCommenters: 0,
        aiAssessment: {
          verdict: "needs_work",
          confidence: 0.71,
        },
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(StartupIdeaCard, { idea: aiReviewedIdea }),
    );

    expect(markup).toContain("Community validation pending");
    expect(markup).toContain("AI assessment: Needs work (71% confidence)");
  });
});
