import { Badge } from "@/components/ui/badge";
import { getValidationScoreDisplay } from "@/lib/utils/idea-validation-display";

export interface ValidationScoreBadgeProps {
  score: number;
  hasEnoughData?: boolean;
  compact?: boolean;
}

export function ValidationScoreBadge({
  score,
  hasEnoughData = true,
  compact = false,
}: ValidationScoreBadgeProps) {
  const display = getValidationScoreDisplay({
    score,
    hasEnoughData,
  });

  return (
    <Badge
      variant={display.pending ? "secondary" : "accent"}
      className={compact ? undefined : "px-3 py-1.5"}
    >
      {display.label}
    </Badge>
  );
}
