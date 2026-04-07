'use client';

const DEFAULT_STEP_LABELS = ['Persona', 'Identity', 'Enter app'];

export function OnboardingProgress({
  step,
  labels = DEFAULT_STEP_LABELS,
}: {
  step: number;
  labels?: string[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {labels.map((label, index) => {
        const value = index + 1;
        const active = step >= value;

        return (
          <div
            key={label}
            className={[
              'rounded-full border px-3 py-2 text-xs tracking-[0.14em] uppercase transition-colors',
              active
                ? 'border-accent/40 bg-accent/[0.08] text-accent'
                : 'border-border-subtle bg-bg-surface text-text-tertiary',
            ].join(' ')}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
