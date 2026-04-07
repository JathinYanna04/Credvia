'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ProfileCompletionChecklist } from '@/components/profile/ProfileCompletionChecklist';
import type { CareerMatch, CareerResumeSummary } from '@/components/career-match/types';
import { humanizeParseStatus, parseStatusVariant } from '@/components/career-match/utils';
import type { ProfileCompletionState } from '@/lib/profile-completion';

interface CareerProfileBlockProps {
  isOwner: boolean;
}

export function CareerProfileBlock({ isOwner }: CareerProfileBlockProps) {
  const [resume, setResume] = useState<CareerResumeSummary | null | undefined>(undefined);
  const [matches, setMatches] = useState<CareerMatch[] | undefined>(undefined);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) {
      return;
    }

    setError(null);
    setResume(undefined);
    setMatches(undefined);

    fetch('/api/v1/resumes')
      .then(async (response) => {
        if (response.status === 401) {
          setResume(null);
          return;
        }

        const payload = (await response.json()) as {
          data?: CareerResumeSummary[];
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load resume status.');
        }

        const list = payload.data ?? [];
        const active = list.find((item) => item.is_active) ?? list[0] ?? null;
        setResume(active);
      })
      .catch((fetchError) => {
        setResume(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load resume status.');
      });

    fetch('/api/v1/matches')
      .then(async (response) => {
        if (response.status === 401) {
          setMatches([]);
          return;
        }

        const payload = (await response.json()) as {
          data?: { matches: CareerMatch[] };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Could not load matches.');
        }

        setMatches(payload.data.matches ?? []);
      })
      .catch((fetchError) => {
        setMatches([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load matches.');
      });

    fetch('/api/v1/users/me')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          data?: { profileCompletion?: ProfileCompletionState };
        };

        setProfileCompletion(payload.data?.profileCompletion ?? null);
      })
      .catch(() => undefined);
  }, [isOwner]);

  const savedCount = useMemo(
    () => matches?.filter((match) => match.saved).length ?? 0,
    [matches],
  );

  if (!isOwner) {
    return null;
  }

  return (
    <div className="space-y-4">
      {profileCompletion ? (
        <ProfileCompletionChecklist
          completion={profileCompletion}
          compact
          title="Strengthen the profile behind your career signal"
          description="Career surfaces work better when your identity and proof-of-work stay aligned."
        />
      ) : null}

      <div className="surface-panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Career</div>
            <h3 className="mt-2 text-lg font-semibold text-text-primary">Career progress</h3>
          </div>
          <Link href="/career" className="text-sm font-medium text-accent">
            Open hub
          </Link>
        </div>

        <div className="mt-4 space-y-3 text-sm text-text-secondary">
          {error ? <div className="text-danger">{error}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-primary">Resume</span>
            {resume ? (
              <Badge variant={parseStatusVariant(resume.parse_status)}>
                {humanizeParseStatus(resume.parse_status)}
              </Badge>
            ) : (
              <Badge variant="secondary">No resume</Badge>
            )}
            <Link href="/resume" className="text-accent">
              Manage
            </Link>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-bg-base px-4 py-3">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Career Match</div>
              <div className="mt-1 text-sm text-text-primary">
                {matches === undefined ? 'Loading matches…' : `${matches?.length ?? 0} ranked roles`}
              </div>
            </div>
            <Link href="/career-match" className="text-sm font-medium text-accent">
              View
            </Link>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-bg-base px-4 py-3">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Saved roles</div>
              <div className="mt-1 text-sm text-text-primary">{savedCount} saved</div>
            </div>
            <Link href="/career#saved" className="text-sm font-medium text-accent">
              Review
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
