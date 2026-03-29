import { Badge } from '@/components/ui/badge';

export interface ValidationScoreBadgeProps {
  score: number;
  compact?: boolean;
}

export function ValidationScoreBadge({
  score,
  compact = false,
}: ValidationScoreBadgeProps) {
  return (
    <Badge variant="accent" className={compact ? undefined : 'px-3 py-1.5'}>
      Validation {compact ? Math.round(score) : `${score.toFixed(1)} pts`}
    </Badge>
  );
}
