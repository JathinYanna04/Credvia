import { Badge } from '@/components/ui/badge';

export interface MatchExplanationProps {
  explanation: {
    fitEstimateLabel?: string;
    roleFamily?: {
      resume?: string;
      job?: string;
    };
    matchedSkillCount?: number;
    missingSkillCount?: number;
  };
  strengths: string[];
  warnings: string[];
}

export function MatchExplanation({
  explanation,
  strengths,
  warnings,
}: MatchExplanationProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <article className="surface-panel space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">Why this fit score exists</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {explanation.fitEstimateLabel ?? 'Career Match scores are deterministic fit estimates, not hiring guarantees.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Resume role family</div>
            <div className="mt-2 text-sm text-text-primary">{explanation.roleFamily?.resume ?? 'Unknown'}</div>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Job role family</div>
            <div className="mt-2 text-sm text-text-primary">{explanation.roleFamily?.job ?? 'Unknown'}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Matched skills: {explanation.matchedSkillCount ?? 0}</Badge>
          <Badge variant="secondary">Missing skills: {explanation.missingSkillCount ?? 0}</Badge>
        </div>
      </article>

      <aside className="space-y-5">
        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Strengths</div>
          {strengths.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              {strengths.map((strength) => <li key={strength}>{strength}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">No explicit strengths were recorded for this match yet.</p>
          )}
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Warnings</div>
          {warnings.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">No major warnings were flagged for this fit estimate.</p>
          )}
        </article>
      </aside>
    </section>
  );
}
