"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PostType } from "@/lib/types";

export interface PostEditorProps {
  type: PostType;
}

interface CommunityOption {
  id: string;
  name: string;
}

const STARTUP_DOMAIN_OPTIONS = [
  "AI/ML",
  "Web Dev",
  "FinTech",
  "HealthTech",
  "EdTech",
  "Developer Tools",
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Creator Economy",
  "Climate Tech",
  "Cybersecurity",
  "Other",
] as const;

export function PostEditor({ type }: PostEditorProps) {
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [community, setCommunity] = useState("");
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [problem, setProblem] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [solution, setSolution] = useState("");
  const [existingAlternatives, setExistingAlternatives] = useState("");
  const [solutionDifferentiation, setSolutionDifferentiation] = useState("");
  const [evidenceOfProblem, setEvidenceOfProblem] = useState("");
  const [marketCategory, setMarketCategory] = useState("");
  const [stage, setStage] = useState("idea");
  const [biggestRiskAssumption, setBiggestRiskAssumption] = useState("");
  const [monetizationModel, setMonetizationModel] = useState("");
  const [supportingEvidenceLinks, setSupportingEvidenceLinks] = useState("");
  const [supportingEvidenceFiles, setSupportingEvidenceFiles] = useState<
    File[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCommunitiesLoading(true);
    setCommunitiesError(null);

    void fetch("/api/v1/communities")
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CommunityOption[];
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(
            payload.error?.message ?? "Could not load communities.",
          );
        }

        const resolved = payload.data ?? [];
        setCommunities(resolved);
        setCommunity((current) => current || resolved[0]?.id || "");
        if (resolved.length === 0) {
          setCommunitiesError(
            "No communities are available yet. Try again shortly.",
          );
        }
      })
      .catch((fetchError: unknown) => {
        setCommunities([]);
        setCommunitiesError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load communities.",
        );
      })
      .finally(() => {
        setCommunitiesLoading(false);
      });
  }, []);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!community || communitiesLoading || communitiesError) {
          setError(communitiesError ?? "Choose a community before publishing.");
          return;
        }

        setSubmitting(true);
        setError(null);

        const response =
          type === "startup_idea"
            ? await (async () => {
                const formData = new FormData();
                formData.append("title", title);
                formData.append("post_type", type);
                formData.append("community_id", community);
                formData.append("startup_idea.problem", problem);
                formData.append("startup_idea.target_audience", targetAudience);
                formData.append("startup_idea.solution", solution);
                formData.append("startup_idea.market_category", marketCategory);
                formData.append("startup_idea.stage", stage);
                formData.append(
                  "startup_idea.existing_alternatives",
                  existingAlternatives,
                );
                formData.append(
                  "startup_idea.differentiation",
                  solutionDifferentiation,
                );
                formData.append(
                  "startup_idea.evidence_of_problem",
                  evidenceOfProblem,
                );
                formData.append(
                  "startup_idea.biggest_risk_assumption",
                  biggestRiskAssumption,
                );

                if (monetizationModel.trim()) {
                  formData.append(
                    "startup_idea.monetization_model",
                    monetizationModel.trim(),
                  );
                }

                if (supportingEvidenceLinks.trim()) {
                  formData.append(
                    "startup_idea.supporting_evidence_links",
                    supportingEvidenceLinks,
                  );
                }

                supportingEvidenceFiles.forEach((file) => {
                  formData.append(
                    "startup_idea.supporting_evidence_files",
                    file,
                  );
                });

                return fetch("/api/v1/posts", {
                  method: "POST",
                  body: formData,
                });
              })()
            : await fetch("/api/v1/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title,
                  post_type: type,
                  community_id: community,
                  body_md: body,
                  external_url: externalUrl,
                  media_url: mediaUrl || undefined,
                }),
              });

        const payload = (await response.json()) as {
          data?: { id: string };
          error?: { message: string };
        };

        if (
          response.ok &&
          typeof payload.data?.id === "string" &&
          payload.data.id.length > 0
        ) {
          const destination =
            type === "startup_idea"
              ? `/ideas/${payload.data.id}`
              : `/post/${payload.data.id}`;

          window.location.assign(destination);
          return;
        }

        setError(payload.error?.message ?? "Failed to publish this post.");
        setSubmitting(false);
      }}
    >
      <Input
        placeholder="Post title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      {type === "startup_idea" ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-secondary">
          Startup ideas are immutable in this MVP. Publish revisions,
          clarifications, or pivots as follow-up comments so validation stays
          auditable.
        </div>
      ) : null}
      <select
        value={community}
        onChange={(event) => setCommunity(event.target.value)}
        disabled={communitiesLoading || Boolean(communitiesError)}
        className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
      >
        {communitiesLoading ? (
          <option value="">Loading communities...</option>
        ) : null}
        {communitiesError ? <option value="">{communitiesError}</option> : null}
        {communities.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {communitiesError ? (
        <p className="text-sm text-danger">{communitiesError}</p>
      ) : null}
      {type === "startup_idea" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <select
              aria-label="Domain"
              value={marketCategory}
              onChange={(event) => setMarketCategory(event.target.value)}
              className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
            >
              <option value="" disabled>
                Domain
              </option>
              {STARTUP_DOMAIN_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              aria-label="Startup Stage"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
            >
              <option value="idea">Idea</option>
              <option value="problem_validation">Problem Validation</option>
              <option value="mvp_building">MVP</option>
              <option value="early_users">Early Users</option>
            </select>
            <Input
              aria-label="Monetization Model"
              placeholder="How will this make money?"
              value={monetizationModel}
              onChange={(event) => setMonetizationModel(event.target.value)}
            />
          </div>
          <Textarea
            aria-label="Problem Statement"
            placeholder="What exact problem are you solving?"
            className="min-h-[120px]"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
          />
          <Input
            aria-label="Target Audience"
            placeholder="Who faces this problem?"
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
          />
          <Textarea
            aria-label="Solution Overview"
            placeholder="Explain how your solution works step-by-step"
            className="min-h-[140px]"
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
          />
          <Textarea
            aria-label="Existing Alternatives"
            placeholder="What are people currently using to solve this problem?"
            className="min-h-[120px]"
            value={existingAlternatives}
            onChange={(event) => setExistingAlternatives(event.target.value)}
          />
          <Textarea
            aria-label="What Makes Your Solution Better?"
            placeholder="Why is your approach better than existing solutions?"
            className="min-h-[120px]"
            value={solutionDifferentiation}
            onChange={(event) => setSolutionDifferentiation(event.target.value)}
          />
          <Textarea
            aria-label="Evidence of Problem"
            placeholder="What proves this problem is real? (stats, user feedback, etc.)"
            className="min-h-[120px]"
            value={evidenceOfProblem}
            onChange={(event) => setEvidenceOfProblem(event.target.value)}
          />
          <Textarea
            aria-label="Biggest Risk / Assumption"
            placeholder="What is the biggest uncertainty in your idea?"
            className="min-h-[120px]"
            value={biggestRiskAssumption}
            onChange={(event) => setBiggestRiskAssumption(event.target.value)}
          />
          <Textarea
            aria-label="Supporting Evidence (Optional)"
            placeholder="Add GitHub, Figma, demo, or research links (one per line)"
            className="min-h-[120px]"
            value={supportingEvidenceLinks}
            onChange={(event) => setSupportingEvidenceLinks(event.target.value)}
          />
          <Input
            aria-label="Supporting Evidence (Optional) Files"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            onChange={(event) =>
              setSupportingEvidenceFiles(Array.from(event.target.files ?? []))
            }
          />
        </>
      ) : (
        <Input placeholder="Add tags (comma separated)" />
      )}
      {type === "startup_idea" ? null : (
        <Textarea
          placeholder={`Write your ${type.replaceAll("_", " ")} here`}
          className="min-h-[220px]"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      )}
      {type === "resource" || type === "project_showcase" ? (
        <Input
          placeholder="External URL"
          value={externalUrl}
          onChange={(event) => setExternalUrl(event.target.value)}
        />
      ) : null}
      {type === "project_showcase" ? (
        <Input
          placeholder="Media URL"
          value={mediaUrl}
          onChange={(event) => setMediaUrl(event.target.value)}
        />
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end">
        <Button
          disabled={
            submitting || communitiesLoading || Boolean(communitiesError)
          }
        >
          {submitting ? "Publishing..." : "Create post"}
        </Button>
      </div>
    </form>
  );
}
