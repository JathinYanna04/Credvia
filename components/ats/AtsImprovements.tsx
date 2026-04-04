import { ArrowRight, Sparkles } from 'lucide-react';
import type { CareerResumeAtsAnalysis } from '@/components/career-match/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export interface AtsImprovementsProps {
  analysis: CareerResumeAtsAnalysis;
  onFix?: () => void;
}

export function AtsImprovements({ analysis, onFix }: AtsImprovementsProps) {
  const items = analysis.suggestedActions.slice(0, 4);

  return (
    <Card padding="lg" className="space-y-5">
      <SectionHeader
        title="What to improve next"
        description="These actions are ranked to help the resume become more ATS-ready without guesswork."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={`${item.title}-${item.impact}`} className="rounded-2xl border border-border-subtle bg-bg-surface p-5 shadow-sm">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm text-text-secondary">{item.reason}</p>
              <Button
                type="button"
                variant="ghost"
                className="mt-4 h-auto px-0 text-accent hover:bg-transparent hover:text-accent"
                onClick={onFix}
              >
                <ArrowRight className="h-4 w-4" />
                Fix
              </Button>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
            No urgent ATS improvements were detected for this profile.
          </div>
        )}
      </div>
    </Card>
  );
}
