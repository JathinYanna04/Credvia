'use client';

import { Input } from '@/components/ui/input';

export interface IdeaFiltersProps {
  sort: 'recent' | 'traction';
  stage: string;
  category: string;
  onSortChange: (value: 'recent' | 'traction') => void;
  onStageChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}

export function IdeaFilters({
  sort,
  stage,
  category,
  onSortChange,
  onStageChange,
  onCategoryChange,
}: IdeaFiltersProps) {
  return (
    <div className="surface-panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Sort</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as 'recent' | 'traction')}
          className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
        >
          <option value="traction">Most traction</option>
          <option value="recent">Most recent</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Stage</span>
        <select
          value={stage}
          onChange={(event) => onStageChange(event.target.value)}
          className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
        >
          <option value="">All stages</option>
          <option value="idea">Idea</option>
          <option value="problem_validation">Problem validation</option>
          <option value="mvp_building">MVP building</option>
          <option value="early_users">Early users</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-text-secondary">
        <span>Market category</span>
        <Input
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          placeholder="e.g. devtools"
        />
      </label>
    </div>
  );
}
