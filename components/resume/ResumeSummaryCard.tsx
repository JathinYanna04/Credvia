import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { Card } from '@/components/ui/Card';

function scoreLabel(score?: number | null) {
  if (typeof score !== 'number') return 'Pending';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Good';
  return 'Needs improvement';
}

export interface ResumeSummaryCardProps {
  analysis: CareerResumeAtsAnalysis | null;
}

export function ResumeSummaryCard({ analysis }: ResumeSummaryCardProps) {
  const strengths = analysis?.strengths.slice(0, 3) ?? [];
  const issues = analysis?.warnings.slice(0, 3) ?? [];
  return (
    <Card padding="lg" className="premium-soft-gradient overflow-hidden">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[24px] bg-white/80 p-5 shadow-sm dark:bg-white/5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">ATS score</div>
          <div className="mt-4 text-6xl font-bold tracking-tight text-text-primary">
            {analysis?.overallScore ?? '--'}
          </div>
          <div className="mt-3 text-sm font-medium text-text-secondary">
            {scoreLabel(analysis?.overallScore)}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-bg-surface/80 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Top strengths
            </div>
            <ul className="mt-4 space-y-2 text-sm text-text-secondary">
              {strengths.length > 0 ? strengths.map((item) => <li key={item}>{item}</li>) : <li>Run analysis to surface strengths.</li>}
            </ul>
          </div>
          <div className="rounded-[24px] bg-bg-surface/80 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Priority issues
            </div>
            <ul className="mt-4 space-y-2 text-sm text-text-secondary">
              {issues.length > 0 ? issues.map((item) => <li key={item}>{item}</li>) : <li>No major issues flagged right now.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
