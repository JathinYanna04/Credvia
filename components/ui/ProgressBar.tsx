import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

const progressVariants = {
  primary: 'bg-[linear-gradient(90deg,#6366F1,#8B5CF6)]',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  neutral: 'bg-text-muted/60',
} as const;

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: keyof typeof progressVariants;
  label?: string;
  valueLabel?: string;
}

export function ProgressBar({
  className,
  value,
  max = 100,
  variant = 'primary',
  label,
  valueLabel,
  ...props
}: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));

  return (
    <div className={cn('space-y-2', className)} {...props}>
      {label || valueLabel ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-text-primary">{label}</span>
          <span className="text-text-secondary">{valueLabel ?? `${Math.round(safeValue)}%`}</span>
        </div>
      ) : null}
      <div className="h-2.5 rounded-full bg-bg-overlay">
        <div
          className={cn('h-2.5 rounded-full transition-all duration-200 ease-out', progressVariants[variant])}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
