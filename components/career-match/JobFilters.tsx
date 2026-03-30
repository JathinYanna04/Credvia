'use client';

import { Input } from '@/components/ui/input';

export interface JobFiltersValue {
  q: string;
  location: string;
  remote: string;
  skill: string;
  sort: 'recent' | 'active';
}

export interface JobFiltersProps {
  value: JobFiltersValue;
  onChange: (next: JobFiltersValue) => void;
}

export function JobFilters({ value, onChange }: JobFiltersProps) {
  return (
    <div className="surface-panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-2 text-sm text-text-secondary xl:col-span-2">
        <span>Search jobs</span>
        <Input
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
          placeholder="Role title, company, or keyword"
        />
      </label>

      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Location</span>
        <Input
          value={value.location}
          onChange={(event) => onChange({ ...value, location: event.target.value })}
          placeholder="Remote, Bangalore, London..."
        />
      </label>

      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Remote policy</span>
        <select
          value={value.remote}
          onChange={(event) => onChange({ ...value, remote: event.target.value })}
          className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
        >
          <option value="">All</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
          <option value="flexible">Flexible</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Sort</span>
        <select
          value={value.sort}
          onChange={(event) => onChange({ ...value, sort: event.target.value as 'recent' | 'active' })}
          className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
        >
          <option value="recent">Most recent</option>
          <option value="active">Most active</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-text-secondary sm:col-span-2 xl:col-span-1">
        <span>Skill</span>
        <Input
          value={value.skill}
          onChange={(event) => onChange({ ...value, skill: event.target.value })}
          placeholder="React, SQL, product..."
        />
      </label>
    </div>
  );
}
