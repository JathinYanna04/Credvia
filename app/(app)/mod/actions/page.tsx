import Link from 'next/link';
import { getModerationActions } from '@/lib/supabase/moderation';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function ModeratorActionsPage() {
  const actions = await getModerationActions();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">Moderation Actions</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Recent content actions you have taken across your communities.
          </p>
        </div>
        <Link href="/mod" className="text-sm text-accent">
          Back to queue
        </Link>
      </header>

      {actions.length === 0 ? (
        <div className="surface-panel p-5 text-sm text-text-secondary">
          No moderation actions recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <article key={action.id} className="surface-panel p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <span>{action.targetType}</span>
                <span>/</span>
                <span>{formatRelativeTime(action.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-text-primary">{action.actionType}</p>
              {action.reason ? (
                <p className="mt-2 text-sm text-text-secondary">{action.reason}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
