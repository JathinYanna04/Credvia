import Link from "next/link";
import { AiAssessmentBadge } from "@/components/startup-ideas/AiAssessmentBadge";
import { Badge } from "@/components/ui/badge";
import { VoteButtons } from "@/components/voting/VoteButtons";
import { ValidationScoreBadge } from "@/components/startup-ideas/ValidationScoreBadge";
import type { PostSummary } from "@/lib/types";
import { hasEnoughCommunityValidationData } from "@/lib/utils/idea-validation-display";
import { formatRelativeTime } from "@/lib/utils/format";

export interface StartupIdeaCardProps {
  idea: PostSummary;
}

function cleanStartupIdeaTitle(title: string) {
  return title
    .replace(/\s*[-_:()]*\s*\d{6,}\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function StartupIdeaCard({ idea }: StartupIdeaCardProps) {
  if (!idea.startupIdea) {
    return null;
  }

  const hasEnoughCommunityData = hasEnoughCommunityValidationData({
    voteScore: idea.voteScore,
    upvoteCount: idea.upvoteCount,
    downvoteCount: idea.downvoteCount,
    commentCount: idea.commentCount,
    saveCount: idea.saveCount,
    uniqueCommenters: idea.startupIdea.uniqueCommenters,
  });

  return (
    <article className="surface-panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <Badge variant="secondary">{idea.community.name}</Badge>
        <Badge variant="outline">
          {idea.startupIdea.stage.replaceAll("_", " ")}
        </Badge>
        <Badge variant="info">{idea.startupIdea.marketCategory}</Badge>
        <span>{formatRelativeTime(idea.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <VoteButtons
          entityType="startup_idea"
          entityId={idea.id}
          initialVoteState={{
            score: idea.voteScore,
            upvoteCount: idea.upvoteCount,
            downvoteCount: idea.downvoteCount,
            currentUserVote: idea.currentUserVote,
            version: idea.version,
            updatedAt: idea.updatedAt,
          }}
          endpoint={`/api/v1/startup-ideas/${idea.id}/vote`}
          orientation="vertical"
          className="hidden sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/ideas/${idea.id}`} className="block">
              <h2 className="text-xl font-semibold text-text-primary transition hover:text-accent">
                {cleanStartupIdeaTitle(idea.title) || idea.title}
              </h2>
            </Link>
            <ValidationScoreBadge
              score={idea.startupIdea.validationScore}
              hasEnoughData={hasEnoughCommunityData}
              compact
            />
            {idea.startupIdea.aiAssessment ? (
              <AiAssessmentBadge
                assessment={idea.startupIdea.aiAssessment}
                compact
              />
            ) : null}
          </div>

          <p className="mt-3 line-clamp-2 text-sm text-text-secondary">
            <span className="text-text-primary">Problem:</span>{" "}
            {idea.startupIdea.problem}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
            <span className="text-text-primary">Audience:</span>{" "}
            {idea.startupIdea.targetAudience}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
            <span className="text-text-primary">Solution:</span>{" "}
            {idea.startupIdea.solution}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary sm:hidden">
            <VoteButtons
              entityType="startup_idea"
              entityId={idea.id}
              initialVoteState={{
                score: idea.voteScore,
                upvoteCount: idea.upvoteCount,
                downvoteCount: idea.downvoteCount,
                currentUserVote: idea.currentUserVote,
                version: idea.version,
                updatedAt: idea.updatedAt,
              }}
              endpoint={`/api/v1/startup-ideas/${idea.id}/vote`}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
            <Badge variant="secondary">
              {formatCountLabel(idea.commentCount, "comment")}
            </Badge>
            <Badge variant="secondary">
              {formatCountLabel(
                idea.startupIdea.uniqueCommenters,
                "contributor",
              )}
            </Badge>
            <Badge variant="secondary">
              {idea.startupIdea.followerCount} followers
            </Badge>
            <Badge variant="secondary">
              {formatCountLabel(idea.startupIdea.revisionCount, "update")}
            </Badge>
            {idea.startupIdea.monetizationModel ? (
              <Badge variant="secondary">
                {idea.startupIdea.monetizationModel}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
