import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

const paddingVariants = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof paddingVariants;
}

export function Card({ className, padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'premium-card premium-card-lift rounded-[16px] border border-border-subtle bg-bg-surface',
        paddingVariants[padding],
        className,
      )}
      {...props}
    />
  );
}
