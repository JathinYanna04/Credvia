export interface AiScoreMeterProps {
  value: number | null;
  label?: string;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function AiScoreMeter({ value, label = 'Confidence' }: AiScoreMeterProps) {
  const normalized = typeof value === 'number' ? clamp(value) : null;
  const percentage = normalized === null ? 0 : Math.round(normalized * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <span>{label}</span>
        <span className="font-medium text-text-primary">
          {normalized === null ? 'n/a' : `${percentage}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-overlay">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
