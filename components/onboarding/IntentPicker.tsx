'use client';

import { Badge } from '@/components/ui/badge';

export function IntentPicker({
  title,
  description,
  options,
  values,
  onToggle,
}: {
  title: string;
  description: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-text-primary">{title}</div>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option);

          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={[
                'rounded-full border px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-accent bg-accent/[0.1] text-accent'
                  : 'border-border-subtle bg-bg-surface text-text-secondary hover:border-accent/30',
              ].join(' ')}
            >
              <Badge variant={active ? 'default' : 'secondary'} className="pointer-events-none">
                {option.replace(/_/g, ' ')}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
