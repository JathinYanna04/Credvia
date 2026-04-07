'use client';

import { Badge } from '@/components/ui/badge';

interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  member_count?: number;
}

interface TopicItem {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
}

export function CommunitiesSelector({
  communities,
  topics,
  selectedCommunityIds,
  selectedTopicIds,
  onToggleCommunity,
  onToggleTopic,
}: {
  communities: CommunityItem[];
  topics: TopicItem[];
  selectedCommunityIds: string[];
  selectedTopicIds: string[];
  onToggleCommunity: (id: string) => void;
  onToggleTopic: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-text-primary">Communities to start with</div>
          <p className="mt-1 text-sm text-text-secondary">
            Pick a few relevant spaces so your first feed already feels focused.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {communities.slice(0, 6).map((community) => {
            const active = selectedCommunityIds.includes(community.id);

            return (
              <button
                key={community.id}
                type="button"
                onClick={() => onToggleCommunity(community.id)}
                className={[
                  'rounded-[22px] border p-4 text-left transition-all',
                  active
                    ? 'border-accent bg-accent/[0.08]'
                    : 'border-border-subtle bg-bg-surface hover:border-accent/30',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-text-primary">{community.name}</div>
                  <Badge variant="secondary">{community.member_count ?? 0} members</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {community.description ?? `Join /${community.slug} to shape your first conversations.`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-text-primary">Topics to follow</div>
          <p className="mt-1 text-sm text-text-secondary">
            These become lightweight signals for search, feed, and right-rail recommendations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const active = selectedTopicIds.includes(topic.id);

            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => onToggleTopic(topic.id)}
                className={[
                  'rounded-full border px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-accent bg-accent/[0.1] text-accent'
                    : 'border-border-subtle bg-bg-surface text-text-secondary hover:border-accent/30',
                ].join(' ')}
              >
                {topic.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
