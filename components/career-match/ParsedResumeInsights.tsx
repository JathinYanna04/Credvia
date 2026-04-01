import Link from 'next/link';
import type { CareerResumeDetail } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';

export interface ParsedResumeInsightsProps {
  detail: CareerResumeDetail;
}

export function ParsedResumeInsights({ detail }: ParsedResumeInsightsProps) {
  const profile = detail.profile;
  const skills = detail.skills;
  const extractionMeta = profile?.raw_sections?.__meta;
  const latestRun = detail.analysisRuns[0] ?? null;
  const showStaleParsedBanner = Boolean(profile && latestRun?.status === 'failed');

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <article className="surface-panel space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">Extracted profile</h2>
          <p className="mt-2 text-sm text-text-secondary">
            This is the structured profile Credvia is currently using for match scoring.
          </p>
          {extractionMeta?.usedOcr ? (
            <p className="mt-2 text-xs text-text-tertiary">
              OCR fallback was used for this extraction because native PDF text quality was too low.
            </p>
          ) : null}
          {showStaleParsedBanner ? (
            <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              Latest extraction failed. Showing the most recent successful parsed content.
            </div>
          ) : null}
        </div>

        {profile ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Current title</div>
                <div className="mt-2 text-sm text-text-primary">{profile.current_title ?? 'Not detected yet'}</div>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Location</div>
                <div className="mt-2 text-sm text-text-primary">{profile.location ?? 'Not detected yet'}</div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Summary</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {profile.summary ?? 'No summary was extracted from this resume yet.'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Experience</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {profile.experience.length > 0 ? profile.experience.slice(0, 4).map((item) => <li key={item}>{item}</li>) : <li>No structured experience lines yet.</li>}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Projects</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {profile.projects.length > 0 ? profile.projects.slice(0, 4).map((item) => <li key={item}>{item}</li>) : <li>No structured project lines yet.</li>}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Education</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {profile.education.length > 0 ? profile.education.slice(0, 4).map((item) => <li key={item}>{item}</li>) : <li>No structured education lines yet.</li>}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
            Run resume analysis to populate your structured profile.
          </div>
        )}
      </article>

      <aside className="space-y-5">
        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Extracted skills</div>
          {skills.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.map((entry) => (
                <Badge key={`${entry.skill.slug}-${entry.source}`} variant={entry.source === 'explicit' ? 'accent' : 'secondary'}>
                  {entry.skill.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">
              No normalized skills detected yet.
            </p>
          )}
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Top match preview</div>
          {detail.topMatches.length > 0 ? (
            <div className="mt-3 space-y-3">
              {detail.topMatches.slice(0, 3).map((match) => (
                <Link
                  key={match.id}
                  href={`/career-match/${match.id}`}
                  className="block rounded-2xl border border-border-subtle bg-bg-surface p-4 hover:border-border-default"
                >
                  <div className="text-sm font-medium text-text-primary">
                    {match.job?.title ?? 'Startup role'}
                  </div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {match.job?.company?.company_name ?? 'Unknown company'} · {Math.round(match.overall_score)}% fit
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">
              Matches will appear here after analysis and recompute complete.
            </p>
          )}
        </article>
      </aside>
    </section>
  );
}
