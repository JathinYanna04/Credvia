'use client';

import { useState } from 'react';
import { PostEditor } from '@/components/post/PostEditor';
import { PostTypeSelector } from '@/components/post/PostTypeSelector';
import type { PostType } from '@/lib/types';

export default function NewPostPage() {
  const [type, setType] = useState<PostType>('question');

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Create a post</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Choose the contribution format first, then shape the post around that intent.
        </p>
      </header>

      <section className="surface-panel p-6">
        <h2 className="text-xl font-semibold">1. Select type</h2>
        <div className="mt-4">
          <PostTypeSelector onSelect={setType} />
        </div>
      </section>

      <section className="surface-panel p-6">
        <h2 className="text-xl font-semibold">2. Compose</h2>
        <div className="mt-4">
          <PostEditor type={type} />
        </div>
      </section>
    </div>
  );
}
