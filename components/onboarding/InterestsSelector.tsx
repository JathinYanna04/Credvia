'use client';

import { Input } from '@/components/ui/input';

export function InterestsSelector({
  interestValue,
  expertiseValue,
  onInterestChange,
  onExpertiseChange,
}: {
  interestValue: string;
  expertiseValue: string;
  onInterestChange: (value: string) => void;
  onExpertiseChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">Interest tags</label>
        <Input
          value={interestValue}
          onChange={(event) => onInterestChange(event.target.value)}
          placeholder="AI, community, startups, hiring"
        />
        <p className="text-xs text-text-tertiary">Comma-separated topics to shape discovery.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">Expertise tags</label>
        <Input
          value={expertiseValue}
          onChange={(event) => onExpertiseChange(event.target.value)}
          placeholder="Backend, design systems, GTM"
        />
        <p className="text-xs text-text-tertiary">Visible signals for profile and search.</p>
      </div>
    </div>
  );
}
