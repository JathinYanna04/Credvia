import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PostTypeBadge } from '@/components/post/PostTypeBadge';
import { ReputationBadge } from '@/components/reputation/ReputationBadge';
import { VoteButtons } from '@/components/voting/VoteButtons';
import { ValidationScoreBadge } from '@/components/startup-ideas/ValidationScoreBadge';
import type { PostSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

export interface PostCardProps {
  post: PostSummary;
}

export function PostCard({ post }: PostCardProps) {
  const topRep = post.author.reputation[0];
  const detailHref = post.postType === 'startup_idea' ? `/ideas/${post.id}` : `/post/${post.id}`;

  return (
    <article className="surface-panel card-lift p-4 sm:p-5">
      <div className="flex gap-4">
        <VoteButtons
          score={post.voteScore}
          endpoint={`/api/v1/posts/${post.id}/vote`}
          className="hidden sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
            <Link href={`/c/${post.community.slug}`}>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[11px] normal-case tracking-normal">
                {post.community.name}
              </Badge>
            </Link>
            <PostTypeBadge type={post.postType} />
            <span>{formatRelativeTime(post.createdAt)}</span>
            {post.unanswered ? <Badge variant="warning">Needs an answer</Badge> : null}
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <Link href={detailHref} className="block">
              <h3 className="line-clamp-2 text-xl font-semibold leading-snug text-text-primary transition hover:text-accent">
                {post.title}
              </h3>
            </Link>
            {post.startupIdea ? (
              <ValidationScoreBadge score={post.startupIdea.validationScore} compact />
            ) : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-text-secondary">{post.body}</p>
          {post.startupIdea ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
              <Badge variant="secondary">{post.startupIdea.stage.replaceAll('_', ' ')}</Badge>
              <Badge variant="secondary">{post.startupIdea.marketCategory}</Badge>
              <Badge variant="secondary">
                {post.startupIdea.uniqueCommenters} unique voices
              </Badge>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-accent/10 text-[10px] font-semibold text-accent">
                  {post.author.fullName
                    .split(' ')
                    .map((chunk) => chunk[0])
                    .join('')
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-text-secondary">@{post.author.username}</span>
            </div>

            <div className="flex items-center gap-2">
              {topRep ? (
                <ReputationBadge
                  score={topRep.score}
                  communityName={topRep.communityName}
                  compact
                />
              ) : (
                <span className="text-xs text-text-tertiary">Reputation grows with votes</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary sm:hidden">
            <VoteButtons score={post.voteScore} endpoint={`/api/v1/posts/${post.id}/vote`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <div className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-3 py-2">
              <MessageSquare className="h-3.5 w-3.5" />
              {post.commentCount}
            </div>
            <Link href={detailHref} className="inline-flex items-center rounded-full border border-border-subtle px-3 py-2 text-text-secondary transition-colors hover:border-border-default hover:text-text-primary">
              Read and respond
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
