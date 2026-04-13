import { Badge } from "@/components/ui/badge";
import type { FounderAiAssessment } from "@/lib/utils/idea-validation-display";
import { getFounderAssessmentDisplay } from "@/lib/utils/idea-validation-display";

export interface AiAssessmentBadgeProps {
  assessment: FounderAiAssessment;
  compact?: boolean;
}

function getAssessmentVariant(verdict: FounderAiAssessment["verdict"]) {
  switch (verdict) {
    case "promising":
      return "success";
    case "high_risk":
      return "danger";
    default:
      return "warning";
  }
}

export function AiAssessmentBadge({
  assessment,
  compact = false,
}: AiAssessmentBadgeProps) {
  const display = getFounderAssessmentDisplay(assessment);

  return (
    <Badge
      variant={getAssessmentVariant(assessment.verdict)}
      className={compact ? undefined : "px-3 py-1.5"}
    >
      {display.label}
    </Badge>
  );
}
