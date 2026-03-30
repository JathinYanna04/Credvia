'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PostSummary } from '@/lib/types';

export interface IdeaRevisionFormProps {
  post: PostSummary;
}

export function IdeaRevisionForm({ post }: IdeaRevisionFormProps) {
  const startupIdea = post.startupIdea;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [problem, setProblem] = useState(startupIdea?.problem ?? '');
  const [targetAudience, setTargetAudience] = useState(startupIdea?.targetAudience ?? '');
  const [solution, setSolution] = useState(startupIdea?.solution ?? '');
  const [marketCategory, setMarketCategory] = useState(startupIdea?.marketCategory ?? '');
  const [stage, setStage] = useState(startupIdea?.stage ?? 'idea');
  const [monetizationModel, setMonetizationModel] = useState(startupIdea?.monetizationModel ?? '');
  const [changeSummary, setChangeSummary] = useState('');

  if (!startupIdea) {
    return null;
  }

  const submitRevision = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/v1/ideas/${post.id}/revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body_md: body,
        startup_idea: {
          problem,
          target_audience: targetAudience,
          solution,
          market_category: marketCategory,
          stage,
          monetization_model: monetizationModel || undefined,
        },
        change_summary: changeSummary,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? 'Could not publish this revision.');
      setLoading(false);
      return;
    }

    setMessage('Revision published. Followers can now see the new snapshot.');
    setChangeSummary('');
    setLoading(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="surface-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Publish a revision</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Add a new startup snapshot without rewriting the original thread.
          </p>
        </div>
        <Button type="button" variant={open ? 'secondary' : 'default'} onClick={() => setOpen((current) => !current)}>
          {open ? 'Close editor' : 'New revision'}
        </Button>
      </div>

      {message ? <p className="mt-4 text-sm text-success">{message}</p> : null}

      {open ? (
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-text-secondary">
            <span>What changed?</span>
            <Input
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="Summarize the pivot, clarification, or new evidence."
            />
          </label>

          <label className="grid gap-2 text-sm text-text-secondary">
            <span>Title</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="grid gap-2 text-sm text-text-secondary">
            <span>Founder note</span>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-text-secondary">
              <span>Problem</span>
              <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} className="min-h-[100px]" />
            </label>
            <label className="grid gap-2 text-sm text-text-secondary">
              <span>Target audience</span>
              <Textarea
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value)}
                className="min-h-[100px]"
              />
            </label>
            <label className="grid gap-2 text-sm text-text-secondary">
              <span>Solution</span>
              <Textarea value={solution} onChange={(event) => setSolution(event.target.value)} className="min-h-[100px]" />
            </label>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-text-secondary">
                <span>Stage</span>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as typeof stage)}
                  className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
                >
                  <option value="idea">Idea</option>
                  <option value="problem_validation">Problem validation</option>
                  <option value="mvp_building">MVP building</option>
                  <option value="early_users">Early users</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-text-secondary">
                <span>Market category</span>
                <Input value={marketCategory} onChange={(event) => setMarketCategory(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm text-text-secondary">
                <span>Monetization</span>
                <Input
                  value={monetizationModel}
                  onChange={(event) => setMonetizationModel(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="button" onClick={() => void submitRevision()} disabled={loading}>
              {loading ? 'Publishing...' : 'Publish revision'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
