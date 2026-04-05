import Link from "next/link";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PostTypeBadge } from "@/components/post/PostTypeBadge";
import { ReputationBadge } from "@/components/reputation/ReputationBadge";
import { VoteButtons } from "@/components/voting/VoteButtons";
import { ValidationScoreBadge } from "@/components/startup-ideas/ValidationScoreBadge";
import type { PostSummary } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils/format";

export interface PostCardProps {
  post: PostSummary;
}

export function PostCard({ post }: PostCardProps) {
  const topRep = post.author.reputation[0];
  const detailHref =
    post.postType === "startup_idea" ? `/ideas/${post.id}` : `/post/${post.id}`;

  return (
    <article className="surface-panel card-lift overflow-hidden p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar className="mt-0.5 h-10 w-10 shrink-0">
          <AvatarFallback className="bg-accent/10 text-xs font-semibold text-accent">
            {post.author.fullName
              .split(" ")
              .map((chunk) => chunk[0])
              .join("")
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-primary">
                {post.author.fullName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
                <span className="truncate">@{post.author.username}</span>
                <span>&bull;</span>
                <span>{formatRelativeTime(post.createdAt)}</span>
              </div>
            </div>
            {topRep ? (
              <div className="hidden shrink-0 sm:block">
                <ReputationBadge
                  score={topRep.score}
                  communityName={topRep.communityName}
                  compact
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <Link href={`/c/${post.community.slug}`}>
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-1 text-[11px] normal-case tracking-normal"
              >
                {post.community.name}
              </Badge>
            </Link>
            <PostTypeBadge type={post.postType} />
            {post.unanswered ? (
              <Badge variant="warning">Needs an answer</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={detailHref} className="block min-w-0 flex-1">
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-text-primary transition hover:text-accent sm:text-xl">
              {post.title}
            </h3>
          </Link>
          {post.startupIdea ? (
            <ValidationScoreBadge
              score={post.startupIdea.validationScore}
              compact
            />
          ) : null}
        </div>

        <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
          {post.body}
        </p>

        {post.startupIdea ? (
          <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
            <Badge variant="secondary">
              {post.startupIdea.stage.replaceAll("_", " ")}
            </Badge>
            <Badge variant="secondary">{post.startupIdea.marketCategory}</Badge>
            <Badge variant="secondary">
              {post.startupIdea.uniqueCommenters} unique voices
            </Badge>
          </div>
        ) : null}

        {!topRep ? (
          <div className="text-xs text-text-tertiary sm:hidden">
            Reputation grows with useful answers and votes.
          </div>
        ) : (
          <div className="sm:hidden">
            <ReputationBadge
              score={topRep.score}
              communityName={topRep.communityName}
              compact
            />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border-subtle pt-4">
        <div className="min-w-0">
          <VoteButtons
            score={post.voteScore}
            initialVote={post.viewerVote ?? 0}
            endpoint={`/api/v1/posts/${post.id}/vote`}
            className="h-11 w-full justify-between rounded-2xl px-2 sm:w-auto"
          />
        </div>
        <Link
          href={detailHref}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-bg-base px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary active:scale-[0.98]"
        >
          <MessageSquare className="h-4 w-4" />
          <span>{post.commentCount}</span>
        </Link>
        <Link
          href={detailHref}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-bg-base px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-overlay hover:text-text-primary active:scale-[0.98]"
        >
          <span>Open</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
