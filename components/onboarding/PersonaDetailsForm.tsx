'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PersonaSlug } from '@/lib/personas';

export interface PersonaFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'textarea';
  helper?: string;
}

export function PersonaDetailsForm({
  persona,
  fields,
  values,
  onChange,
}: {
  persona: PersonaSlug | null;
  fields: PersonaFieldConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (!persona || fields.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          className={field.type === 'textarea' ? 'space-y-2 sm:col-span-2' : 'space-y-2'}
        >
          <label className="text-sm font-medium text-text-primary">{field.label}</label>
          {field.type === 'textarea' ? (
            <Textarea
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          ) : (
            <Input
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          )}
          {field.helper ? <p className="text-xs text-text-tertiary">{field.helper}</p> : null}
        </div>
      ))}
    </div>
  );
}
