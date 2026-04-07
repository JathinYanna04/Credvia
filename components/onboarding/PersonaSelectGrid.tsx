'use client';

import { Badge } from '@/components/ui/badge';
import { PERSONA_DEFINITIONS, PERSONA_SLUGS, type PersonaSlug } from '@/lib/personas';

export function PersonaSelectGrid({
  value,
  onChange,
}: {
  value: PersonaSlug | null;
  onChange: (value: PersonaSlug) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {PERSONA_SLUGS.map((slug) => {
        const item = PERSONA_DEFINITIONS[slug];
        const active = value === slug;

        return (
          <button
            key={slug}
            type="button"
            onClick={() => onChange(slug)}
            className={[
              'text-left rounded-[24px] border p-5 transition-all',
              active
                ? 'border-accent bg-accent/[0.08] shadow-[0_16px_36px_rgba(79,70,229,0.12)]'
                : 'border-border-subtle bg-bg-surface hover:border-accent/40 hover:bg-bg-base',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <Badge variant={active ? 'default' : 'secondary'}>{item.label}</Badge>
              <span className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                {item.iconToken}
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-text-primary">{item.onboardingIntent}</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{item.shortDescription}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.likelyOutcomes.map((outcome) => (
                <Badge key={outcome} variant="secondary">
                  {outcome}
                </Badge>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
