import { Activity } from 'lucide-react';
import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/Card';

function getScoreLabel(score: number) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Good';
  return 'Needs improvement';
}

function getScoreVariant(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

export interface AtsScoreCardProps {
  analysis: CareerResumeAtsAnalysis;
}

export function AtsScoreCard({ analysis }: AtsScoreCardProps) {
  const score = analysis.overallScore;
  return (
    <Card padding="lg" className="premium-soft-gradient overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-accent shadow-sm dark:bg-white/10">
            <Activity className="h-5 w-5" />
          </div>
          <div className="mt-6 flex items-end gap-3">
            <div className="text-5xl font-bold tracking-tight text-text-primary">{score}</div>
            <div className="pb-2 text-sm text-text-secondary">/100</div>
          </div>
          <p className="mt-3 max-w-lg text-sm text-text-secondary">{analysis.summary}</p>
        </div>
        <Badge variant={getScoreVariant(score)}>{getScoreLabel(score)}</Badge>
      </div>
    </Card>
  );
}
