'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { PostTypeBadge } from '@/components/post/PostTypeBadge';
import type { PostType } from '@/lib/types';

const postTypes: PostType[] = [
  'question',
  'discussion',
  'project_showcase',
  'resource',
  'opportunity',
  'resume_review',
  'looking_for_collaborator',
  'startup_idea',
];

export interface PostTypeSelectorProps {
  onSelect?: (value: PostType) => void;
}

export function PostTypeSelector({ onSelect }: PostTypeSelectorProps) {
  const [selected, setSelected] = useState<PostType>('question');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {postTypes.map((type) => (
        <button
          key={type}
          type="button"
          className={cn(
            'rounded-2xl border p-4 text-left transition',
            selected === type
              ? 'border-accent bg-[rgba(34,211,238,0.08)]'
              : 'border-border-subtle bg-bg-surface hover:border-border-default',
          )}
          onClick={() => {
            setSelected(type);
            onSelect?.(type);
          }}
        >
          <PostTypeBadge type={type} />
          <p className="mt-3 text-sm text-text-secondary">
            Structured prompts and signals tuned for {type.replaceAll('_', ' ')}.
          </p>
        </button>
      ))}
    </div>
  );
}
