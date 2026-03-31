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
    <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
      <div className="flex gap-3 md:grid md:grid-cols-2">
      {postTypes.map((type) => (
        <button
          key={type}
          type="button"
          className={cn(
            'w-[240px] shrink-0 rounded-2xl border p-4 text-left transition active:scale-[0.98] md:w-auto',
            selected === type
              ? 'border-accent bg-accent/8'
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
    </div>
  );
}
