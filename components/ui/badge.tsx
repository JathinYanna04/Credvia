import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-border-default bg-bg-overlay text-text-primary',
        accent: 'border-transparent bg-[rgba(34,211,238,0.12)] text-accent',
        secondary: 'border-border-subtle bg-bg-surface text-text-secondary',
        success: 'border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] text-success',
        warning: 'border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.08)] text-warning',
        danger: 'border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] text-danger',
        info: 'border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.08)] text-info',
        outline: 'border-border-default bg-transparent text-text-primary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
