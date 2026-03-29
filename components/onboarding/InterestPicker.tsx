'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

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
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    void supabase
      .from('skills')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setSkills(data ?? []);
      });
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    await supabase.from('user_skills').delete().eq('user_id', user.id);

    if (selected.length > 0) {
      await supabase.from('user_skills').insert(
        selected.map((skillId) => ({
          user_id: user.id,
          skill_id: skillId,
        })),
      );
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
      <Button onClick={handleContinue} disabled={loading}>
        {loading ? 'Saving...' : 'Continue'}
      </Button>
    </div>
  );
}
