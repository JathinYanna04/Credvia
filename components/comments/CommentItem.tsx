import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BestAnswerBadge } from '@/components/comments/BestAnswerBadge';
import { VoteButtons } from '@/components/voting/VoteButtons';
import type { CommentSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

export interface CommentItemProps {
  comment: CommentSummary;
  depth?: number;
}

export function CommentItem({ comment, depth = 0 }: CommentItemProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <VoteButtons
          score={comment.voteScore}
          endpoint={`/api/v1/comments/${comment.id}/vote`}
          orientation="vertical"
          className="hidden sm:flex"
        />
        <div className="min-w-0 flex-1 rounded-2xl border border-border-subtle bg-bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px]">
                {comment.author.fullName
                  .split(' ')
                  .map((chunk) => chunk[0])
                  .join('')
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-text-primary">@{comment.author.username}</span>
            <span className="text-xs text-text-tertiary">{formatRelativeTime(comment.createdAt)}</span>
            {comment.isBestAnswer ? <BestAnswerBadge /> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{comment.body}</p>
          <div className="mt-4 sm:hidden">
            <VoteButtons score={comment.voteScore} endpoint={`/api/v1/comments/${comment.id}/vote`} />
          </div>
        </div>
      </div>

      {comment.replies?.length ? (
        <div className="ml-4 space-y-4 border-l border-border-subtle pl-4 sm:ml-8 sm:pl-6">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
