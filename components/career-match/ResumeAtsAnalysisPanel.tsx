'use client';

import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { AtsBreakdown } from '@/components/ats/AtsBreakdown';
import { AtsImprovements } from '@/components/ats/AtsImprovements';
import { AtsScoreCard } from '@/components/ats/AtsScoreCard';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/Card';

export interface ResumeAtsAnalysisPanelProps {
  analysis: CareerResumeAtsAnalysis | null;
  onFix?: () => void;
}

export function ResumeAtsAnalysisPanel({ analysis, onFix }: ResumeAtsAnalysisPanelProps) {
  if (!analysis) {
    return (
      <Card padding="lg">
        <h2 className="text-[22px] font-semibold text-text-primary">ATS analysis</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Run extraction and analysis to generate an ATS quality breakdown.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <AtsScoreCard analysis={analysis} />
        <Card padding="lg" className="space-y-4">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Signals at a glance</div>
          <div className="flex flex-wrap gap-2">
            {analysis.strengths.slice(0, 4).map((strength) => (
              <Badge key={strength} variant="success">
                {strength}
              </Badge>
            ))}
            {analysis.missingKeywords.slice(0, 4).map((keyword) => (
              <Badge key={keyword} variant="warning">
                {keyword}
              </Badge>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-text-primary">Risks</div>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {analysis.warnings.length > 0 ? analysis.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>) : <li>No major ATS risks detected.</li>}
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">Missing essentials</div>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {analysis.missingEssentials.length > 0 ? analysis.missingEssentials.slice(0, 4).map((item) => <li key={item}>{item}</li>) : <li>No critical essentials missing.</li>}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <AtsBreakdown analysis={analysis} />
      <AtsImprovements analysis={analysis} onFix={onFix} />
    </section>
  );
}
