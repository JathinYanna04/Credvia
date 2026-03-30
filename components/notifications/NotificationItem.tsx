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
  const isReward = notification.type === 'reputation_gain' || notification.type === 'vote';

  return (
    <article
      className={`rounded-3xl border p-4 shadow-sm transition-colors ${
        notification.unread
          ? isReward
            ? 'border-accent/25 bg-accent/10'
            : 'border-accent/15 bg-accent/5'
          : 'border-border-subtle bg-bg-surface'
      }`}
    >
      <div className="flex gap-3">
        <div
          className={`mt-0.5 rounded-2xl p-2.5 ${
            isReward ? 'bg-accent/12 text-accent' : 'bg-bg-overlay text-accent'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isReward ? (
              <div className="inline-flex rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
                Reputation moved
              </div>
            ) : null}
            {notification.unread ? (
              <div className="inline-flex rounded-full bg-bg-base px-2.5 py-1 text-[11px] font-medium text-text-tertiary">
                New
              </div>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-text-primary">
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
