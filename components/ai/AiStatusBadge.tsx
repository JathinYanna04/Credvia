import { Badge } from '@/components/ui/badge';
import type { AiRunStatus } from '@/lib/types';

export interface AiStatusBadgeProps {
  status: AiRunStatus;
}

const STATUS_LABELS: Record<AiRunStatus, string> = {
  queued: 'Queued',
  running: 'Processing',
  succeeded: 'Ready',
  failed: 'Failed',
};

const STATUS_VARIANTS: Record<AiRunStatus, 'secondary' | 'info' | 'success' | 'danger'> = {
  queued: 'secondary',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
};

export function AiStatusBadge({ status }: AiStatusBadgeProps) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
