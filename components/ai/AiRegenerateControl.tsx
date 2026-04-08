'use client';

import { Button } from '@/components/ui/button';

export interface AiRegenerateControlProps {
  onRegenerate: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export function AiRegenerateControl({
  onRegenerate,
  loading = false,
  disabled = false,
  label = 'Regenerate',
}: AiRegenerateControlProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || loading}
      onClick={onRegenerate}
    >
      {loading ? 'Regenerating...' : label}
    </Button>
  );
}
