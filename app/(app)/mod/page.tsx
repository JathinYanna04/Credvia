import Link from 'next/link';
import { ModerationActionButtons } from '@/components/moderation/ModerationActionButtons';
import { getModerationActions, getModerationQueue } from '@/lib/supabase/moderation';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function ModeratorPage() {
  const [reports, actions] = await Promise.all([
    getModerationQueue(),
    getModerationActions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">Moderation</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Review open reports and take lightweight enforcement action.
          </p>
        </div>
        <div className="flex gap-3 text-sm text-text-secondary">
          <Link href="/mod/reports" className="text-accent">
            Reports
          </Link>
          <Link href="/mod/actions">Actions</Link>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Open queue</h2>
        {reports.length === 0 ? (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            No open reports in your moderated communities.
          </div>
        ) : (
          reports.slice(0, 8).map((report) => (
            <article key={report.id} className="surface-panel space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <span>{report.communityName ?? 'Unknown community'}</span>
                <span>/</span>
                <span>{report.targetType}</span>
                <span>/</span>
                <span>{report.reasonCode}</span>
                <span>/</span>
                <span>{formatRelativeTime(report.createdAt)}</span>
              </div>
              <p className="text-sm text-text-primary">{report.preview}</p>
              {report.details ? (
                <p className="text-sm text-text-secondary">{report.details}</p>
              ) : null}
              <ModerationActionButtons reportId={report.id} aiReview={report.aiReview ?? null} />
            </article>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Recent actions</h2>
        {actions.length === 0 ? (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            No moderation actions taken yet.
          </div>
        ) : (
          actions.slice(0, 6).map((action) => (
            <div key={action.id} className="surface-panel p-4 text-sm text-text-secondary">
              <span className="text-text-primary">{action.actionType}</span> {action.targetType} ·{' '}
              {formatRelativeTime(action.createdAt)}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
