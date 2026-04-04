'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { CareerStructuredProject } from '@/components/career-match/types';

export interface ProjectsEditorProps {
  projects: CareerStructuredProject[];
  onChange: (projects: CareerStructuredProject[]) => void;
}

export function ProjectsEditor({ projects, onChange }: ProjectsEditorProps) {
  function updateProject(index: number, patch: Partial<CareerStructuredProject>) {
    onChange(projects.map((project, projectIndex) => (projectIndex === index ? { ...project, ...patch } : project)));
  }

  return (
    <div className="space-y-4">
      {projects.map((project, index) => (
        <div key={`project-${index}`} className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-text-primary">Project {index + 1}</div>
            <button type="button" onClick={() => onChange(projects.filter((_, projectIndex) => projectIndex !== index))} className="text-text-tertiary transition-colors hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={project.name ?? ''} onChange={(event) => updateProject(index, { name: event.target.value || null })} placeholder="Project title" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
            <input value={(project.technologies ?? []).join(', ')} onChange={(event) => updateProject(index, { technologies: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Tech stack" className="h-11 rounded-2xl border border-border-subtle bg-bg-main px-4 text-sm outline-none transition focus:border-accent" />
          </div>
          <textarea value={project.description ?? ''} onChange={(event) => updateProject(index, { description: event.target.value || null })} placeholder="Describe the project clearly" className="mt-3 min-h-[96px] w-full rounded-2xl border border-border-subtle bg-bg-main px-4 py-3 text-sm outline-none transition focus:border-accent" />
          <textarea value={(project.bullets ?? []).join('\n')} onChange={(event) => updateProject(index, { bullets: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} placeholder="One bullet per line" className="mt-3 min-h-[120px] w-full rounded-2xl border border-border-subtle bg-bg-main px-4 py-3 text-sm outline-none transition focus:border-accent" />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...projects, { name: null, description: null, bullets: [], technologies: [], links: [] }])}
        className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-surface px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-border-default"
      >
        <Plus className="h-4 w-4" />
        Add project
      </button>
    </div>
  );
}
