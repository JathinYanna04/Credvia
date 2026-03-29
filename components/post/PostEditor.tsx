'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PostType } from '@/lib/types';

export interface PostEditorProps {
  type: PostType;
}

interface CommunityOption {
  id: string;
  name: string;
}

export function PostEditor({ type }: PostEditorProps) {
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [community, setCommunity] = useState('');
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [problem, setProblem] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [solution, setSolution] = useState('');
  const [marketCategory, setMarketCategory] = useState('');
  const [stage, setStage] = useState('idea');
  const [monetizationModel, setMonetizationModel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setCommunitiesLoading(true);
    setCommunitiesError(null);

    void fetch('/api/v1/communities')
      .then(async (response) => {
        const payload = (await response.json()) as { data?: CommunityOption[]; error?: { message?: string } };
        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load communities.');
        }

        const resolved = payload.data ?? [];
        setCommunities(resolved);
        setCommunity((current) => current || resolved[0]?.id || '');
        if (resolved.length === 0) {
          setCommunitiesError('No communities are available yet. Try again shortly.');
        }
      })
      .catch((fetchError: unknown) => {
        setCommunities([]);
        setCommunitiesError(
          fetchError instanceof Error ? fetchError.message : 'Could not load communities.',
        );
      })
      .finally(() => {
        setCommunitiesLoading(false);
      });
  }, []);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!community || communitiesLoading || communitiesError) {
          setError(communitiesError ?? 'Choose a community before publishing.');
          return;
        }

        setSubmitting(true);
        setError(null);

        const response = await fetch('/api/v1/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            post_type: type,
            community_id: community,
            body_md: body,
            external_url: externalUrl,
            media_url: mediaUrl || undefined,
            startup_idea:
              type === 'startup_idea'
                ? {
                    problem,
                    target_audience: targetAudience,
                    solution,
                    market_category: marketCategory,
                    stage,
                    monetization_model: monetizationModel || undefined,
                  }
                : undefined,
          }),
        });

        const payload = (await response.json()) as { data?: { id: string }; error?: { message: string } };

        if (response.ok && typeof payload.data?.id === 'string' && payload.data.id.length > 0) {
          router.push(type === 'startup_idea' ? `/ideas/${payload.data.id}` : `/post/${payload.data.id}`);
          router.refresh();
          return;
        }

        setError(payload.error?.message ?? 'Failed to publish this post.');
        setSubmitting(false);
      }}
    >
      <Input placeholder="Post title" value={title} onChange={(event) => setTitle(event.target.value)} />
      {type === 'startup_idea' ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-secondary">
          Startup ideas are immutable in this MVP. Publish revisions, clarifications, or pivots as
          follow-up comments so validation stays auditable.
        </div>
      ) : null}
      <select
        value={community}
        onChange={(event) => setCommunity(event.target.value)}
        disabled={communitiesLoading || Boolean(communitiesError)}
        className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
      >
        {communitiesLoading ? (
          <option value="">Loading communities...</option>
        ) : null}
        {communitiesError ? (
          <option value="">{communitiesError}</option>
        ) : null}
        {communities.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {communitiesError ? <p className="text-sm text-danger">{communitiesError}</p> : null}
      {type === 'startup_idea' ? (
        <>
          <Textarea
            placeholder="What specific problem are you solving?"
            className="min-h-[120px]"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
          />
          <Input
            placeholder="Who is this for?"
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
          />
          <Textarea
            placeholder="Describe the solution and why it is meaningfully better."
            className="min-h-[140px]"
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              placeholder="Market category"
              value={marketCategory}
              onChange={(event) => setMarketCategory(event.target.value)}
            />
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
            >
              <option value="idea">Idea</option>
              <option value="problem_validation">Problem validation</option>
              <option value="mvp_building">MVP building</option>
              <option value="early_users">Early users</option>
            </select>
            <Input
              placeholder="Monetization model"
              value={monetizationModel}
              onChange={(event) => setMonetizationModel(event.target.value)}
            />
          </div>
        </>
      ) : (
        <Input placeholder="Add tags (comma separated)" />
      )}
      <Textarea
        placeholder={`Write your ${type.replaceAll('_', ' ')} here`}
        className="min-h-[220px]"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {(type === 'resource' || type === 'project_showcase') ? (
        <Input
          placeholder="External URL"
          value={externalUrl}
          onChange={(event) => setExternalUrl(event.target.value)}
        />
      ) : null}
      {type === 'project_showcase' ? (
        <Input
          placeholder="Media URL"
          value={mediaUrl}
          onChange={(event) => setMediaUrl(event.target.value)}
        />
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end">
        <Button disabled={submitting || communitiesLoading || Boolean(communitiesError)}>
          {submitting ? 'Publishing...' : 'Create post'}
        </Button>
      </div>
    </form>
  );
}
