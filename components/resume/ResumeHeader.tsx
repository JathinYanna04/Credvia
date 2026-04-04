import { FileText, RefreshCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ResumeHeaderProps {
  resumeName: string;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'danger' | 'secondary';
  subtitle?: string | null;
  onImprove: () => void;
  onReanalyze: () => void;
  improveDisabled?: boolean;
  reanalyzeDisabled?: boolean;
  improveLoading?: boolean;
  reanalyzeLoading?: boolean;
}

export function ResumeHeader({
  resumeName,
  statusLabel,
  statusVariant,
  subtitle,
  onImprove,
  onReanalyze,
  improveDisabled,
  reanalyzeDisabled,
  improveLoading,
  reanalyzeLoading,
}: ResumeHeaderProps) {
  return (
    <div className="premium-soft-gradient rounded-[28px] border border-border-subtle p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-accent shadow-sm dark:bg-white/10">
              <FileText className="h-5 w-5" />
            </div>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-text-primary">{resumeName}</h1>
            {subtitle ? <p className="mt-2 max-w-3xl text-sm text-text-secondary">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={onImprove}
            disabled={improveDisabled}
            loading={improveLoading}
          >
            <Sparkles className="h-4 w-4" />
            Improve Resume
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onReanalyze}
            disabled={reanalyzeDisabled}
            loading={reanalyzeLoading}
          >
            <RefreshCcw className="h-4 w-4" />
            Re-analyze
          </Button>
        </div>
      </div>
    </div>
  );
}
