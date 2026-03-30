'use client';

import { useState } from 'react';
import { PostEditor } from '@/components/post/PostEditor';
import { PostTypeSelector } from '@/components/post/PostTypeSelector';
import type { PostType } from '@/lib/types';

export default function NewPostPage() {
  const [type, setType] = useState<PostType>('question');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="surface-panel space-y-3 p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Contribute</div>
        <h1 className="text-3xl font-semibold">Create a post</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Start with a strong title, then add only the context someone needs to help you or learn from you.
        </p>
      </header>

      <section className="surface-panel p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Choose the format</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Questions and discussions should feel easy to start. Optional details can come later.
        </p>
        <div className="mt-4">
          <PostTypeSelector onSelect={setType} />
        </div>
      </section>

      <section className="surface-panel p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Write the title, then add context</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Aim for something people can understand in a quick scan.
        </p>
        <div className="mt-4">
          <PostEditor type={type} />
        </div>
      </section>
    </div>
  );
}
