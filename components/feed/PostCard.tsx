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

  return (
    <article className="surface-panel card-lift p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <Badge variant="secondary">{post.community.name}</Badge>
        <PostTypeBadge type={post.postType} />
        <span>{formatRelativeTime(post.createdAt)}</span>
        {post.unanswered ? <Badge variant="warning">Unanswered</Badge> : null}
      </div>

      <div className="flex gap-4">
        <VoteButtons
          score={post.voteScore}
          endpoint={`/api/v1/posts/${post.id}/vote`}
          className="hidden sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={post.postType === 'startup_idea' ? `/ideas/${post.id}` : `/post/${post.id}`} className="block">
              <h3 className="line-clamp-2 text-lg font-semibold text-text-primary transition hover:text-accent">
                {post.title}
              </h3>
            </Link>
            {post.startupIdea ? (
              <ValidationScoreBadge score={post.startupIdea.validationScore} compact />
            ) : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{post.body}</p>
          {post.startupIdea ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
              <Badge variant="secondary">{post.startupIdea.stage.replaceAll('_', ' ')}</Badge>
              <Badge variant="secondary">{post.startupIdea.marketCategory}</Badge>
              <Badge variant="secondary">
                {post.startupIdea.uniqueCommenters} unique voices
              </Badge>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {post.author.fullName
                    .split(' ')
                    .map((chunk) => chunk[0])
                    .join('')
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-text-secondary">@{post.author.username}</span>
            </div>

            {topRep ? (
              <ReputationBadge
                score={topRep.score}
                communityName={topRep.communityName}
                compact
              />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary sm:hidden">
            <VoteButtons score={post.voteScore} endpoint={`/api/v1/posts/${post.id}/vote`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <div className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-3 py-2">
              <MessageSquare className="h-3.5 w-3.5" />
              {post.commentCount}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
