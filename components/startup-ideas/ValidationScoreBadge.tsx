import { Badge } from "@/components/ui/badge";

export interface ValidationScoreBadgeProps {
  score: number;
  compact?: boolean;
}

function getDisplayScore(score: number) {
  return Math.max(0, Math.min(10, Math.round(score)));
}

export function ValidationScoreBadge({
  score,
  compact = false,
}: ValidationScoreBadgeProps) {
  return (
    <Badge variant="accent" className={compact ? undefined : "px-3 py-1.5"}>
      {compact
        ? `🔥 Validation: ${getDisplayScore(score)}/10`
        : `🔥 Validation: ${getDisplayScore(score)}/10`}
    </Badge>
  );
}
