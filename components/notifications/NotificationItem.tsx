import { BellRing, GitBranch, MessageSquare, Star, UserPlus } from 'lucide-react';
import type { NotificationSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

export interface NotificationItemProps {
  notification: NotificationSummary;
}

const iconMap = {
  reply: MessageSquare,
  mention: MessageSquare,
  vote: BellRing,
  best_answer: Star,
  follow: UserPlus,
  idea_revision: GitBranch,
  mod_action: BellRing,
  reputation_gain: Star,
} as const;

export function NotificationItem({ notification }: NotificationItemProps) {
  const Icon = iconMap[notification.type];

  return (
    <article
      className={`rounded-2xl border p-4 ${
        notification.unread
          ? 'border-accent/30 bg-[rgba(34,211,238,0.06)]'
          : 'border-border-subtle bg-bg-surface'
      }`}
    >
      <div className="flex gap-3">
        <div className="mt-1 rounded-full bg-bg-overlay p-2 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm text-text-primary">
            <span className="font-medium">{notification.actor.username}</span> {notification.description}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </div>
    </article>
  );
}
