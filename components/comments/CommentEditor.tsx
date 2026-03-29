'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface CommentEditorProps {
  postId: string;
}

export function CommentEditor({ postId }: CommentEditorProps) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="surface-panel p-4">
      <label htmlFor="comment-body" className="sr-only">
        Add comment
      </label>
      <Textarea
        id="comment-body"
        placeholder="Add your answer or perspective"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <Button
          disabled={loading}
          onClick={async () => {
            if (!body.trim()) {
              setError('Write feedback before publishing.');
              return;
            }

            setLoading(true);
            setError(null);
            const response = await fetch(`/api/v1/posts/${postId}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                post_id: postId,
                body_md: body,
              }),
            });

            if (response.ok) {
              setBody('');
              router.refresh();
            } else {
              const payload = (await response.json()) as { error?: { message?: string } };
              setError(payload.error?.message ?? 'Could not publish this comment.');
            }

            setLoading(false);
          }}
        >
          {loading ? 'Publishing...' : 'Publish comment'}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
