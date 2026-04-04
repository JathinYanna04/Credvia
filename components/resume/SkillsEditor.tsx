'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

export interface SkillsEditorProps {
  title: string;
  description?: string;
  values: string[];
  onChange: (values: string[]) => void;
}

export function SkillsEditor({ title, description, values, onChange }: SkillsEditorProps) {
  const [draft, setDraft] = useState('');

  function addSkill() {
    const next = draft.trim();
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setDraft('');
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-surface p-4">
      <div>
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {description ? <p className="mt-1 text-xs text-text-secondary">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="inline-flex items-center gap-2 rounded-full bg-bg-overlay px-3 py-1 text-xs font-medium text-text-primary">
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} className="text-text-tertiary transition-colors hover:text-text-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addSkill();
            }
          }}
          placeholder="Add a skill"
          className="h-11 flex-1 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm text-text-primary outline-none transition focus:border-accent"
        />
        <button type="button" onClick={addSkill} className="rounded-2xl bg-accent px-4 text-sm font-medium text-white">
          Add
        </button>
      </div>
    </div>
  );
}
