'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import posthog from '@/lib/analytics/posthog-client';

interface SkillOption {
  id: string;
  name: string;
}

export interface InterestPickerProps {
  onContinue?: () => void;
}

export function InterestPicker({ onContinue }: InterestPickerProps) {
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const trackedStartRef = useRef(false);

  useEffect(() => {
    if (trackedStartRef.current) {
      return;
    }

    trackedStartRef.current = true;
    posthog.capture('onboarding_started');
  }, []);

  useEffect(() => {
    void fetch('/api/v1/users/me')
      .then((response) => response.json())
      .then((payload: { data?: { availableSkills?: SkillOption[]; selectedSkillIds?: string[] } }) => {
        setSkills(payload.data?.availableSkills ?? []);
        setSelected(payload.data?.selectedSkillIds ?? []);
      })
      .catch(() => {
        setError('Could not load available skills.');
      });
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    const response = await fetch('/api/v1/users/me/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skills: selected,
        profile: {},
        onboarding_complete: false,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? 'Could not save your interests.');
      setLoading(false);
      return;
    }

    onContinue?.();
    router.push('/onboarding/communities');
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        {skills.map((skill) => {
          const active = selected.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() =>
                setSelected((current) =>
                  active ? current.filter((item) => item !== skill.id) : [...current, skill.id],
                )
              }
            >
              <Badge variant={active ? 'accent' : 'secondary'} className="px-4 py-2 text-sm">
                {skill.name}
              </Badge>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button onClick={handleContinue} disabled={loading}>
        {loading ? 'Saving...' : 'Continue'}
      </Button>
    </div>
  );
}
