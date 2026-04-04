'use client';

import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';

export interface ResumeAtsAnalysisPanelProps {
  analysis: CareerResumeAtsAnalysis | null;
}

function scoreTone(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Needs work';
  return 'Weak';
}

export function ResumeAtsAnalysisPanel({ analysis }: ResumeAtsAnalysisPanelProps) {
  if (!analysis) {
    return (
      <section className="surface-panel rounded-2xl p-6">
        <h2 className="text-xl font-semibold">ATS analysis</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Run extraction and analysis to generate an ATS quality breakdown.
        </p>
      </section>
    );
  }

  const scoreCards = [
    { label: 'Overall ATS score', value: analysis.overallScore },
    { label: 'Section completeness', value: analysis.sectionCompleteness },
    { label: 'Contact completeness', value: analysis.contactCompleteness },
    { label: 'Skills coverage', value: analysis.skillsCoverage },
    { label: 'Education quality', value: analysis.educationQuality },
    { label: 'Experience depth', value: analysis.experienceDepth },
    { label: 'Projects quality', value: analysis.projectsQuality },
    { label: 'Parse confidence', value: analysis.parseConfidence },
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <article className="surface-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">ATS analysis</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Rule-based quality scoring for structure, completeness, and match readiness.
              </p>
            </div>
            <Badge variant={scoreTone(analysis.overallScore)}>
              {scoreLabel(analysis.overallScore)}
            </Badge>
          </div>

          <div className="mt-6 flex items-end gap-3">
            <div className="text-5xl font-semibold text-text-primary">{analysis.overallScore}</div>
            <div className="pb-1 text-sm text-text-secondary">/ 100</div>
          </div>
          <p className="mt-4 text-sm text-text-secondary">{analysis.summary}</p>
          <div className="mt-3 text-xs uppercase tracking-[0.14em] text-text-tertiary">
            Confidence: {analysis.confidenceLabel}
          </div>

          <div className="mt-4 h-2.5 w-full rounded-full bg-bg-overlay">
            <div
              className="h-2.5 rounded-full bg-accent"
              style={{ width: `${Math.min(100, analysis.overallScore)}%` }}
            />
          </div>
        </article>

        <article className="surface-panel rounded-2xl p-6">
          <h3 className="text-base font-semibold">Recommended next actions</h3>
          <div className="mt-4 space-y-3">
            {analysis.suggestedActions.length > 0 ? (
              analysis.suggestedActions.slice(0, 4).map((action) => (
                <div key={`${action.title}-${action.impact}`} className="rounded-xl border border-border-subtle bg-bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text-primary">{action.title}</div>
                    <Badge variant={action.impact === 'must_fix' ? 'danger' : action.impact === 'high' ? 'warning' : 'secondary'}>
                      {action.impact === 'must_fix' ? 'Must fix' : action.impact === 'high' ? 'High impact' : 'Nice to have'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">{action.reason}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">
                No urgent ATS improvements were detected for this resume.
              </p>
            )}
          </div>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {scoreCards.map((card) => (
          <article key={card.label} className="surface-panel rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">{card.label}</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-2xl font-semibold text-text-primary">{card.value}</div>
              <Badge variant={scoreTone(card.value)}>{scoreLabel(card.value)}</Badge>
            </div>
          </article>
        ))}
      </div>

      <article className="surface-panel rounded-2xl p-6">
        <h3 className="text-base font-semibold">Score breakdown</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {analysis.subScores.map((item) => (
            <div key={item.key} className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-text-primary">{item.label}</div>
                <Badge variant={scoreTone(item.score)}>{item.score}</Badge>
              </div>
              <div className="mt-2 text-xs text-text-tertiary">
                Weight {Math.round(item.weight * 100)}% · Contribution {item.weightedScore}
              </div>
              <p className="mt-2 text-sm text-text-secondary">{item.rationale}</p>
            </div>
          ))}
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="surface-panel rounded-2xl p-5">
          <h3 className="text-base font-semibold">Strengths</h3>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            {analysis.strengths.length > 0 ? (
              analysis.strengths.map((strength) => <li key={strength}>{strength}</li>)
            ) : (
              <li>No strong ATS signals were detected yet.</li>
            )}
          </ul>
        </article>

        <article className="surface-panel rounded-2xl p-5">
          <h3 className="text-base font-semibold">Warnings</h3>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            {analysis.warnings.length > 0 ? (
              analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)
            ) : (
              <li>No major ATS warnings detected.</li>
            )}
          </ul>
        </article>

        <article className="surface-panel rounded-2xl p-5">
          <h3 className="text-base font-semibold">Missing essentials</h3>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            {analysis.missingEssentials.length > 0 ? (
              analysis.missingEssentials.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>No critical ATS essentials are currently missing.</li>
            )}
          </ul>
        </article>
      </div>

      <article className="surface-panel rounded-2xl p-5">
        <h3 className="text-base font-semibold">Missing keywords</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.missingKeywords.length > 0 ? (
            analysis.missingKeywords.map((item) => (
              <Badge key={item} variant="warning">
                {item}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-text-secondary">No current target-keyword gaps were flagged.</span>
          )}
        </div>
      </article>
    </section>
  );
}
