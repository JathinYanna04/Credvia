import { Badge } from '@/components/ui/badge';
import type { StartupIdeaRevisionSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

export interface IdeaRevisionTimelineProps {
  revisions: StartupIdeaRevisionSummary[];
}

export function IdeaRevisionTimeline({ revisions }: IdeaRevisionTimelineProps) {
  const ordered = [...revisions].sort((left, right) => right.revisionNumber - left.revisionNumber);

  return (
    <section className="surface-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Revision timeline</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Founders can publish new snapshots without erasing the original thesis.
          </p>
        </div>
        <Badge variant="secondary">{ordered.length} revisions</Badge>
      </div>

      <div className="mt-5 space-y-4">
        {ordered.map((revision, index) => (
          <article key={revision.id} className="rounded-2xl border border-border-subtle bg-bg-base p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={index === 0 ? 'accent' : 'outline'}>
                Revision {revision.revisionNumber}
              </Badge>
              <span className="text-xs text-text-tertiary">
                {formatRelativeTime(revision.createdAt)}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-text-primary">{revision.title}</h3>
            {revision.changeSummary ? (
              <p className="mt-2 text-sm text-text-secondary">{revision.changeSummary}</p>
            ) : null}
            <div className="mt-4 grid gap-3 text-sm text-text-secondary md:grid-cols-2">
              <div>
                <span className="text-text-primary">Problem:</span> {revision.problem}
              </div>
              <div>
                <span className="text-text-primary">Audience:</span> {revision.targetAudience}
              </div>
              <div>
                <span className="text-text-primary">Solution:</span> {revision.solution}
              </div>
              <div>
                <span className="text-text-primary">Stage:</span> {revision.stage.replaceAll('_', ' ')}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
