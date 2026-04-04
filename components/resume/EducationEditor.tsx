'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { CareerStructuredEducation } from '@/components/career-match/types';

export interface EducationEditorProps {
  education: CareerStructuredEducation[];
  onChange: (education: CareerStructuredEducation[]) => void;
}

export function EducationEditor({ education, onChange }: EducationEditorProps) {
  function updateEntry(index: number, patch: Partial<CareerStructuredEducation>) {
    onChange(education.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-4">
      {education.map((entry, index) => (
        <div key={`education-${index}`} className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-text-primary">Education {index + 1}</div>
            <button type="button" onClick={() => onChange(education.filter((_, itemIndex) => itemIndex !== index))} className="text-text-tertiary transition-colors hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={entry.institution ?? ''} onChange={(event) => updateEntry(index, { institution: event.target.value || null })} placeholder="Institution" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={entry.degree ?? ''} onChange={(event) => updateEntry(index, { degree: event.target.value || null })} placeholder="Degree" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={entry.field_of_study ?? ''} onChange={(event) => updateEntry(index, { field_of_study: event.target.value || null })} placeholder="Field of study" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={entry.grade ?? ''} onChange={(event) => updateEntry(index, { grade: event.target.value || null })} placeholder="Grade or GPA" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={entry.start_date ?? ''} onChange={(event) => updateEntry(index, { start_date: event.target.value || null })} placeholder="Start date" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={entry.end_date ?? ''} onChange={(event) => updateEntry(index, { end_date: event.target.value || null })} placeholder="End date" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...education, { institution: null, degree: null, field_of_study: null, start_date: null, end_date: null, grade: null, location: null, description: null }])}
        className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-surface px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-border-default"
      >
        <Plus className="h-4 w-4" />
        Add education
      </button>
    </div>
  );
}
