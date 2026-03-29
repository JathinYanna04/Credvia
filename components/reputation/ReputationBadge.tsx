import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

export interface ReputationBadgeProps {
  score: number;
  communityName: string;
  compact?: boolean;
  className?: string;
}

function getTier(score: number) {
  if (score >= 5000) return 'text-rep-diamond border-[rgba(34,211,238,0.22)] bg-[rgba(34,211,238,0.08)]';
  if (score >= 1000) return 'text-rep-gold border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.08)]';
  if (score >= 250) return 'text-rep-silver border-[rgba(156,163,175,0.24)] bg-[rgba(156,163,175,0.08)]';
  if (score >= 50) return 'text-rep-bronze border-[rgba(205,124,74,0.24)] bg-[rgba(205,124,74,0.08)]';
  return 'text-text-secondary';
}

export function ReputationBadge({
  score,
  communityName,
  compact,
  className,
}: ReputationBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-2 py-1 font-mono text-[11px]',
        compact ? 'gap-1' : 'gap-2 px-3',
        getTier(score),
        className,
      )}
      title={`Reputation in ${communityName}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{score}</span>
    </Badge>
  );
}
