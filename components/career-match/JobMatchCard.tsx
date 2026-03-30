'use client';

import Link from 'next/link';
import type { CareerMatch } from '@/components/career-match/types';
import { SavedMatchButton } from '@/components/career-match/SavedMatchButton';
import { formatDate, formatPercent } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';

export interface JobMatchCardProps {
  match: CareerMatch;
  onSavedChange?: (saved: boolean) => void;
}

export function JobMatchCard({ match, onSavedChange }: JobMatchCardProps) {
  return (
    <article className="surface-panel space-y-4 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{formatPercent(match.overall_score)} fit</Badge>
            {match.job?.remote_policy ? <Badge variant="secondary">{match.job.remote_policy}</Badge> : null}
          </div>
          <div>
            <Link href={`/career-match/${match.id}`} className="text-xl font-semibold text-text-primary hover:text-accent">
              {match.job?.title ?? 'Startup role'}
            </Link>
            <p className="mt-1 text-sm text-text-secondary">
              {match.job?.company?.company_name ?? 'Unknown company'}
              {match.job?.location ? ` · ${match.job.location}` : ''}
            </p>
          </div>
          <p className="text-xs text-text-tertiary">
            Computed {formatDate(match.computed_at)}
          </p>
        </div>

        <SavedMatchButton
          matchId={match.id}
          saved={Boolean(match.saved)}
          onSavedChange={(saved) => onSavedChange?.(saved)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Matched skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.matched_skills.length > 0 ? (
              match.matched_skills.slice(0, 6).map((skill) => (
                <Badge key={skill} variant="success">
                  {skill}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-text-secondary">No direct overlaps yet.</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Missing skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.missing_skills.length > 0 ? (
              match.missing_skills.slice(0, 6).map((skill) => (
                <Badge key={skill} variant="warning">
                  {skill}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-text-secondary">No major gaps flagged.</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
