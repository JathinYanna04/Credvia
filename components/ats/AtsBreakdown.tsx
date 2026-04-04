import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';

export interface AtsBreakdownProps {
  analysis: CareerResumeAtsAnalysis;
}

const highlightedRows = [
  { key: 'skillsCoverage', label: 'Skills', variant: 'primary' as const },
  { key: 'projectsQuality', label: 'Projects', variant: 'success' as const },
  { key: 'educationQuality', label: 'Education', variant: 'warning' as const },
  { key: 'experienceDepth', label: 'Impact', variant: 'primary' as const },
] as const;

export function AtsBreakdown({ analysis }: AtsBreakdownProps) {
  return (
    <Card padding="lg" className="space-y-5">
      <SectionHeader
        title="Weighted ATS breakdown"
        description="A transparent view into the areas helping or hurting this resume right now."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {highlightedRows.map((row) => (
          <ProgressBar
            key={row.key}
            label={row.label}
            value={analysis[row.key]}
            valueLabel={`${analysis[row.key]}/100`}
            variant={row.variant}
          />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {analysis.subScores.map((item) => (
          <div key={item.key} className="rounded-2xl border border-border-subtle bg-bg-overlay/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-text-primary">{item.label}</div>
              <div className="text-sm font-semibold text-text-primary">{item.score}</div>
            </div>
            <div className="mt-1 text-xs text-text-tertiary">
              Weight {Math.round(item.weight * 100)}% · Contribution {item.weightedScore}
            </div>
            <p className="mt-2 text-sm text-text-secondary">{item.rationale}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
