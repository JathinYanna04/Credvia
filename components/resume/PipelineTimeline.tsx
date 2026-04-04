import { Brain, CheckCircle2, FileText, ScanSearch, Upload } from 'lucide-react';
import type { CareerStructuredDiagnostics } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/Card';

type StepState = 'success' | 'skipped' | 'failed' | 'pending';

function stepStyles(state: StepState) {
  if (state === 'success') return 'border-success/30 bg-success/10 text-success';
  if (state === 'failed') return 'border-danger/30 bg-danger/10 text-danger';
  if (state === 'skipped') return 'border-border-subtle bg-bg-overlay text-text-secondary';
  return 'border-border-subtle bg-bg-surface text-text-secondary';
}

export interface PipelineTimelineProps {
  diagnostics: CareerStructuredDiagnostics | null | undefined;
  uploaded: boolean;
  analysisReady: boolean;
}

export function PipelineTimeline({ diagnostics, uploaded, analysisReady }: PipelineTimelineProps) {
  const ocrState: StepState =
    diagnostics?.ocrStatus === 'used_successfully'
      ? 'success'
      : diagnostics?.ocrStatus === 'failed_preserved_previous' || diagnostics?.ocrStatus === 'unavailable_preserved_previous'
        ? 'failed'
        : diagnostics?.ocrStatus === 'skipped_unnecessary' || diagnostics?.ocrNeeded === false
          ? 'skipped'
          : diagnostics?.ocrAttempted
            ? 'success'
            : 'pending';

  const llmState: StepState =
    diagnostics?.llmStatus === 'success'
      ? 'success'
      : diagnostics?.llmStatus === 'skipped'
        ? 'skipped'
        : diagnostics?.llmStatus === 'error' || diagnostics?.llmStatus === 'not_configured'
          ? 'failed'
          : 'pending';

  const steps = [
    { label: 'Upload', icon: Upload, state: uploaded ? 'success' : 'pending' as StepState },
    { label: 'Extract', icon: FileText, state: diagnostics ? 'success' : 'pending' as StepState },
    { label: 'OCR', icon: ScanSearch, state: ocrState },
    { label: 'LLM', icon: Brain, state: llmState },
    { label: 'Analysis', icon: CheckCircle2, state: analysisReady ? 'success' : 'pending' as StepState },
  ];

  return (
    <Card padding="md" className="overflow-x-auto">
      <div className="flex min-w-[720px] items-center gap-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex flex-1 items-center gap-3">
              <div className={`flex min-w-[132px] items-center gap-3 rounded-2xl border px-4 py-3 ${stepStyles(step.state)}`}>
                <Icon className="h-4 w-4" />
                <div>
                  <div className="text-xs uppercase tracking-[0.12em]">{step.label}</div>
                  <Badge
                    variant={
                      step.state === 'success'
                        ? 'success'
                        : step.state === 'failed'
                          ? 'danger'
                          : 'secondary'
                    }
                    className="mt-2"
                  >
                    {step.state === 'success'
                      ? 'Complete'
                      : step.state === 'skipped'
                        ? 'Skipped'
                        : step.state === 'failed'
                          ? 'Failed'
                          : 'Pending'}
                  </Badge>
                </div>
              </div>
              {index < steps.length - 1 ? <div className="h-px flex-1 bg-border-subtle" /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
