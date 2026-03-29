import { CommentItem } from '@/components/comments/CommentItem';
import type { CommentSummary } from '@/lib/types';

export interface CommentThreadProps {
  comments: CommentSummary[];
}

export function CommentThread({ comments }: CommentThreadProps) {
  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
