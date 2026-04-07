import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { JoinIdeaDiscussionButton } from '@/components/chat/JoinIdeaDiscussionButton';
import { StartDirectMessageButton } from '@/components/chat/StartDirectMessageButton';
import { CommentEditor } from "@/components/comments/CommentEditor";
import { CommentThread } from "@/components/comments/CommentThread";
import { PostTypeBadge } from "@/components/post/PostTypeBadge";
import { IdeaFollowButton } from "@/components/startup-ideas/IdeaFollowButton";
import { IdeaRevisionForm } from "@/components/startup-ideas/IdeaRevisionForm";
import { IdeaRevisionTimeline } from "@/components/startup-ideas/IdeaRevisionTimeline";
import { ReportIdeaButton } from "@/components/startup-ideas/ReportIdeaButton";
import { ValidationScoreBadge } from "@/components/startup-ideas/ValidationScoreBadge";
import { VoteButtons } from "@/components/voting/VoteButtons";
import type {
  CommentSummary,
  PostSummary,
  StartupIdeaRevisionSummary,
} from "@/lib/types";
import { toVoteEntityTypeFromPostType } from '@/lib/voting';
import { formatRelativeTime } from "@/lib/utils/format";

export interface PostDetailProps {
  post: PostSummary;
  comments: CommentSummary[];
  currentUserId?: string | null;
  startupIdeaContext?: {
    revisions: StartupIdeaRevisionSummary[];
    canRevise: boolean;
    isFollowing: boolean;
    advancedFeaturesEnabled: boolean;
  };
}

export function PostDetail({
  post,
  comments,
  currentUserId = null,
  startupIdeaContext,
}: PostDetailProps) {
  const topRep = post.author.reputation[0];
  const voteEntityType = toVoteEntityTypeFromPostType(post.postType);
  const voteEndpoint =
    post.postType === 'startup_idea'
      ? `/api/v1/startup-ideas/${post.id}/vote`
      : `/api/v1/posts/${post.id}/vote`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          <Link href={`/c/${post.community.slug}`} className="text-accent">
            {post.community.name}
          </Link>
          <span>/</span>
          <PostTypeBadge type={post.postType} />
          <span>{formatRelativeTime(post.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            {post.title}
          </h1>
          {post.startupIdea ? (
            <ValidationScoreBadge score={post.startupIdea.validationScore} />
          ) : null}
        </div>
        <div className="surface-panel flex flex-col gap-4 p-4 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-medium text-text-primary">
              @{post.author.username}
            </div>
            {topRep ? (
              <div className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                {topRep.score} rep in {topRep.communityName}
              </div>
            ) : (
              <div className="rounded-full bg-bg-overlay px-3 py-1 text-xs">
                Reputation grows when people upvote useful work
              </div>
            )}
          </div>
          <div className="rounded-full bg-bg-base px-3 py-1.5 text-xs font-medium text-text-secondary">
            {post.commentCount} replies
          </div>
        </div>
        <p className="max-w-3xl text-base leading-8 text-text-secondary">
          {post.body}
        </p>
        {post.feedExplanation ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Why this appears:</span>{' '}
            {post.feedExplanation.reasons.join(' • ')}
          </div>
        ) : null}
        {post.startupIdea ? (
          <div className="grid gap-4 rounded-3xl border border-border-subtle bg-bg-surface p-5 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Problem
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {post.startupIdea.problem}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Target Audience
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {post.startupIdea.targetAudience}
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Solution
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {post.startupIdea.solution}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  Stage
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {post.startupIdea.stage.replaceAll("_", " ")}
                </p>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  Market Category
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {post.startupIdea.marketCategory}
                </p>
              </div>
              {post.startupIdea.monetizationModel ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                    Monetization
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {post.startupIdea.monetizationModel}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {post.startupIdea ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-secondary">
            Startup ideas stay append-only. Founders can publish revisions
            without overwriting earlier thinking, so the validation trail
            remains transparent.
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-6 rounded-3xl border border-border-subtle bg-bg-surface p-5 sm:flex-row">
        <VoteButtons
          entityType={voteEntityType}
          entityId={post.id}
          initialVoteState={{
            score: post.voteScore,
            upvoteCount: post.upvoteCount,
            downvoteCount: post.downvoteCount,
            currentUserVote: post.currentUserVote,
            version: post.version,
            updatedAt: post.updatedAt,
          }}
          endpoint={voteEndpoint}
          orientation="vertical"
        />
        <div className="min-w-0 flex-1">
          {post.externalUrl ? (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-5 flex items-center justify-between rounded-2xl border border-border-subtle bg-bg-base px-4 py-4 text-sm text-text-primary"
            >
              <span>Open attached project or resource</span>
              <ExternalLink className="h-4 w-4 text-accent" />
            </a>
          ) : null}

          <div className="grid gap-2 text-sm text-text-secondary sm:flex sm:flex-wrap sm:items-center">
            <StartDirectMessageButton
              currentUserId={currentUserId}
              targetUserId={post.author.id}
              label={post.postType === 'startup_idea' ? 'Message founder' : 'Message author'}
              variant="secondary"
              size="sm"
            />
            {post.postType === 'startup_idea' ? (
              <JoinIdeaDiscussionButton
                currentUserId={currentUserId}
                ideaId={post.id}
                founderUserId={post.author.id}
                label="Join discussion"
                variant="outline"
                size="sm"
              />
            ) : null}
            {post.startupIdea && startupIdeaContext?.advancedFeaturesEnabled ? (
              <IdeaFollowButton
                postId={post.id}
                initialFollowing={startupIdeaContext?.isFollowing ?? false}
                initialFollowerCount={post.startupIdea.followerCount}
              />
            ) : null}
            <ReportIdeaButton postId={post.id} />
          </div>
        </div>
      </div>

      {post.startupIdea && startupIdeaContext?.advancedFeaturesEnabled ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <IdeaRevisionTimeline
            revisions={startupIdeaContext?.revisions ?? []}
          />
          <div className="space-y-4">
            <div className="surface-panel p-5">
              <h2 className="text-lg font-semibold text-text-primary">
                Idea momentum
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                    Followers
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">
                    {post.startupIdea.followerCount}
                  </p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                    Revisions
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">
                    {post.startupIdea.revisionCount}
                  </p>
                </div>
              </div>
              {post.startupIdea.lastRevisionAt ? (
                <p className="mt-4 text-sm text-text-secondary">
                  Last revised{" "}
                  {formatRelativeTime(post.startupIdea.lastRevisionAt)}
                </p>
              ) : null}
            </div>

            {startupIdeaContext?.canRevise ? (
              <IdeaRevisionForm post={post} />
            ) : (
              <div className="surface-panel p-5 text-sm text-text-secondary">
                Follow this idea to get notified when the founder publishes a
                revision.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Answers and discussion</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Add a concrete answer, useful context, or a sharper follow-up.
            </p>
          </div>
          <div className="rounded-full bg-bg-overlay px-3 py-1.5 text-sm text-text-secondary">
            Answer this
          </div>
        </div>
        <CommentEditor postId={post.id} />
        {comments.length === 0 ? (
          <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
            <p>No feedback yet.</p>
            <p>
              Be the first person to pressure-test this with a concrete answer
              or a useful follow-up question.
            </p>
          </div>
        ) : null}
        <CommentThread comments={comments} />
      </section>
    </div>
  );
}
