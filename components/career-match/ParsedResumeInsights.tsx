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
  const finalSource = extractionMeta?.finalSource ?? null;
  const acceptedWithWarnings =
    extractionMeta?.acceptedWithWarnings === true ||
    extractionMeta?.warningCode != null ||
    extractionMeta?.extractionQuality?.confidenceTier === 'low';
  const contaminationScore =
    extractionMeta?.extractionQuality?.contaminationScore ??
    (typeof extractionMeta?.contaminationScore === 'number'
      ? extractionMeta.contaminationScore
      : null);
  const salvageScore =
    extractionMeta?.extractionQuality?.salvageScore ??
    (typeof extractionMeta?.salvageScore === 'number' ? extractionMeta.salvageScore : null);
  const recoveredFromNoise =
    acceptedWithWarnings && typeof contaminationScore === 'number' && contaminationScore >= 70;
  const pdfInternalHint = /xref|flatedecode|objstm|endstream|startxref|endobj|\/(Type|Length|Filter|DecodeParms|Root|Info|Pages|Catalog|Page|Font|Contents|MediaBox|Resources)/i;

  const sanitizeDisplayValue = (value: string | null | undefined) => {
    if (!value) return null;
    const cleaned = value
      .replace(/[\u00BD\u00D3\u00AF\u0087\u0011]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\[\(\-]+/g, '')
      .trim();
    return cleaned || null;
  };

  const isNoiseLine = (line: string | null | undefined) => {
    if (!line) return true;
    if (!pdfInternalHint.test(line)) return false;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) return false;
    const alphaWords = line.match(/\b[A-Za-z]{2,}\b/g) ?? [];
    const slashHits = line.match(/\/[A-Za-z]/g)?.length ?? 0;
    const internalHits =
      (line.match(/\b(xref|obj|stream|endstream|startxref|flatedecode)\b/gi)?.length ?? 0) +
      slashHits;
    const internalRatio = internalHits / tokens.length;
    const alphaRatio = alphaWords.length / tokens.length;
    return internalRatio >= 0.35 || (slashHits >= 4 && alphaWords.length < 4) || alphaRatio < 0.25;
  };

  const sanitizeLines = (items: string[]) =>
    items
      .map((item) => sanitizeDisplayValue(item))
      .filter((item): item is string => Boolean(item))
      .filter((item) => !isNoiseLine(item));
  const summaryText = sanitizeDisplayValue(profile?.summary ?? null);
  const sanitizedSummary = summaryText && !isNoiseLine(summaryText) ? summaryText : null;
  const sanitizedExperience = profile ? sanitizeLines(profile.experience) : [];
  const sanitizedProjects = profile ? sanitizeLines(profile.projects) : [];
  const sanitizedEducation = profile ? sanitizeLines(profile.education) : [];
  const sanitizedTitle = sanitizeDisplayValue(profile?.current_title ?? null);
  const sanitizedLocation = sanitizeDisplayValue(profile?.location ?? null);
  const hasStructuredContent =
    Boolean(sanitizedSummary) ||
    sanitizedExperience.length > 0 ||
    sanitizedProjects.length > 0 ||
    sanitizedEducation.length > 0;
  const finalSourceLabel =
    finalSource === 'llm'
      ? 'LLM'
      : finalSource === 'merged'
        ? 'Merged'
        : finalSource === 'heuristic_fallback'
          ? 'Fallback'
          : null;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <article className="surface-panel space-y-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Extracted profile</h2>
            {finalSourceLabel ? <Badge variant="secondary">{finalSourceLabel}</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            This is the structured profile Credvia is currently using for match scoring.
          </p>
          {extractionMeta?.usedOcr ? (
            <p className="mt-2 text-xs text-text-tertiary">
              OCR fallback was used for this extraction because native PDF text quality was too low.
            </p>
          ) : null}
          {recoveredFromNoise ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">
              Recovered from noisy PDF
              {typeof salvageScore === 'number' ? `- Salvage ${salvageScore}` : ''}
            </div>
          ) : null}
          {showStaleParsedBanner ? (
            <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              Latest extraction failed. Showing the most recent successful parsed content.
            </div>
          ) : null}
        </div>

        {profile ? (
          <div className="space-y-4">
            {acceptedWithWarnings && !hasStructuredContent ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                We extracted this resume with warnings, but no structured content could be detected yet.
                <div className="mt-2 text-xs text-warning/90">
                  Try a DOCX or cleaner PDF to improve parsing quality.
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Current title</div>
                <div className="mt-2 text-sm text-text-primary">{sanitizedTitle ?? 'Not detected yet'}</div>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Location</div>
                <div className="mt-2 text-sm text-text-primary">{sanitizedLocation ?? 'Not detected yet'}</div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Summary</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {sanitizedSummary ?? 'No summary was extracted from this resume yet.'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Experience</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {sanitizedExperience.length > 0 ? (
                    sanitizedExperience.slice(0, 4).map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No structured experience lines yet.</li>
                  )}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Projects</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {sanitizedProjects.length > 0 ? (
                    sanitizedProjects.slice(0, 4).map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No structured project lines yet.</li>
                  )}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Education</div>
                <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                  {sanitizedEducation.length > 0 ? (
                    sanitizedEducation.slice(0, 4).map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No structured education lines yet.</li>
                  )}
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
                <Badge
                  key={`${entry.skill.slug}-${entry.source}`}
                  variant={entry.source === 'explicit' ? 'accent' : 'secondary'}
                >
                  {entry.skill.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">No normalized skills detected yet.</p>
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
                    {match.job?.company?.company_name ?? 'Unknown company'} - {Math.round(match.overall_score)}% fit
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
