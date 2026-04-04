import { ArrowUpRight, Target } from 'lucide-react';
import type { CareerMatch } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';

function scoreVariant(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

export interface JobMatchCardProps {
  match: CareerMatch;
}

export function JobMatchCard({ match }: JobMatchCardProps) {
  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Job match</div>
          <h3 className="mt-2 text-lg font-semibold text-text-primary">
            {match.job?.title ?? 'Startup role'}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {match.job?.company?.company_name ?? 'Unknown company'}
          </p>
        </div>
        <div className="text-right">
          <Badge variant={scoreVariant(match.overall_score)}>{Math.round(match.overall_score)}% fit</Badge>
          <div className="mt-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Target className="h-5 w-5" />
          </div>
        </div>
      </div>

      <ProgressBar value={match.overall_score} valueLabel={`${Math.round(match.overall_score)} / 100`} />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Matched skills</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(match.explanation?.matchedSkills ?? match.matched_skills ?? []).slice(0, 6).map((skill) => (
              <span key={skill} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                {skill}
              </span>
            ))}
          </div>
          <div className="mt-4 text-xs uppercase tracking-[0.16em] text-text-tertiary">Key evidence</div>
          <div className="mt-2 space-y-2">
            {(match.explanation?.matchedEvidence ?? []).slice(0, 2).map((item, index) => (
              <div key={`${match.id}-evidence-${index}`} className="rounded-2xl bg-bg-overlay/50 px-4 py-3 text-sm text-text-secondary">
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Missing skills</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(match.explanation?.missingMustHaveSkills ?? match.missing_skills ?? []).slice(0, 6).map((skill) => (
              <span key={skill} className="rounded-full border border-border-subtle px-3 py-1 text-xs font-medium text-text-secondary">
                {skill}
              </span>
            ))}
            {(match.explanation?.missingMustHaveSkills ?? match.missing_skills ?? []).length === 0 ? (
              <span className="text-sm text-text-secondary">No major must-have gaps detected.</span>
            ) : null}
          </div>
          <div className="mt-4 text-xs uppercase tracking-[0.16em] text-text-tertiary">Suggestion</div>
          <div className="mt-2 rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary">
            {(match.explanation?.recommendations ?? [])[0] ??
              'Use the review editor to strengthen direct evidence for the missing skills.'}
          </div>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 text-sm font-medium text-accent">
        View fit rationale
        <ArrowUpRight className="h-4 w-4" />
      </div>
    </Card>
  );
}
