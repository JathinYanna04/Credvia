'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OnboardingPreviewCard } from '@/components/onboarding/OnboardingPreviewCard';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { PersonaSelectGrid } from '@/components/onboarding/PersonaSelectGrid';
import { buildProfileCompletionChecklist } from '@/lib/profile-completion';
import {
  getPersonaDefinition,
  normalizePersonaSlug,
  type PersonaSlug,
} from '@/lib/personas';

interface MePayload {
  data?: {
    profile?: {
      username?: string | null;
      full_name?: string | null;
      headline?: string | null;
      bio?: string | null;
      location?: string | null;
      avatar_url?: string | null;
      primary_persona?: string | null;
      onboarding_complete?: boolean;
    };
  };
  error?: { message?: string };
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
type Step = 1 | 2 | 3;

type DraftState = {
  username: string;
  full_name: string;
  headline: string;
  bio: string;
  location: string;
  avatar_url: string;
  primary_persona: PersonaSlug | null;
};

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  1: {
    title: 'How do you want to use Credvia?',
    description:
      'Pick the persona that should shape your first-run experience. Everything else can evolve once you are inside.',
  },
  2: {
    title: 'Set the basics people will see first',
    description:
      'Just enough identity to unlock profile URLs, mentions, and a credible first impression. Extra profile detail can wait.',
  },
  3: {
    title: 'Enter with a clean starting point',
    description:
      'You are setting up the minimum to start. Credvia will suggest the right next profile steps after you enter.',
  },
};

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);
}

export function PersonaOnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    username: '',
    full_name: '',
    headline: '',
    bio: '',
    location: '',
    avatar_url: '',
    primary_persona: null,
  });

  useEffect(() => {
    let mounted = true;

    fetch('/api/v1/users/me')
      .then((response) => response.json() as Promise<MePayload>)
      .then((me) => {
        if (!mounted) {
          return;
        }

        if (me.error?.message) {
          throw new Error(me.error.message);
        }

        const profile = me.data?.profile;
        const primaryPersona = normalizePersonaSlug(profile?.primary_persona);

        setDraft({
          username: profile?.username ?? '',
          full_name: profile?.full_name ?? '',
          headline: profile?.headline ?? '',
          bio: profile?.bio ?? '',
          location: profile?.location ?? '',
          avatar_url: profile?.avatar_url ?? '',
          primary_persona: primaryPersona,
        });
        setShowOptionalDetails(
          Boolean(profile?.headline || profile?.bio || profile?.location || profile?.avatar_url),
        );
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load onboarding.');
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const persona = draft.primary_persona ? getPersonaDefinition(draft.primary_persona) : null;
  const normalizedUsername = useMemo(() => normalizeUsername(draft.username), [draft.username]);
  const basicIdentityReady =
    normalizedUsername.length >= 3 &&
    draft.full_name.trim().length >= 2 &&
    usernameStatus === 'available';
  const completionPreview = useMemo(
    () =>
      buildProfileCompletionChecklist({
        profile: {
          primary_persona: draft.primary_persona,
          username: normalizedUsername,
          full_name: draft.full_name.trim(),
          headline: draft.headline.trim(),
          bio: draft.bio.trim(),
          open_to: [],
          profile_intent: [],
          interest_tags: [],
          expertise_tags: [],
        },
      }),
    [draft.bio, draft.full_name, draft.headline, draft.primary_persona, normalizedUsername],
  );

  useEffect(() => {
    if (!normalizedUsername) {
      setUsernameStatus('idle');
      setUsernameMessage(null);
      return;
    }

    if (!/^[a-z0-9_-]{3,30}$/.test(normalizedUsername)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Use 3 to 30 lowercase letters, numbers, underscores, or hyphens.');
      return;
    }

    let cancelled = false;
    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    const timeoutId = window.setTimeout(() => {
      fetch(`/api/v1/users/username-availability?username=${encodeURIComponent(normalizedUsername)}`)
        .then(async (response) => {
          const payload = (await response.json()) as {
            data?: { available?: boolean };
            error?: { message?: string };
          };

          if (cancelled) {
            return;
          }

          if (!response.ok) {
            setUsernameStatus('invalid');
            setUsernameMessage(payload.error?.message ?? 'Could not validate that username.');
            return;
          }

          if (payload.data?.available) {
            setUsernameStatus('available');
            setUsernameMessage('Username is available.');
            return;
          }

          setUsernameStatus('taken');
          setUsernameMessage('That username is already taken.');
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setUsernameStatus('invalid');
          setUsernameMessage('Could not validate that username.');
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedUsername]);

  const save = async () => {
    if (!draft.primary_persona) {
      setError('Choose a persona to continue.');
      return;
    }

    if (!basicIdentityReady) {
      setError('Finish the required identity fields before entering the app.');
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch('/api/v1/users/me/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        onboarding_complete: true,
        profile: {
          username: normalizedUsername,
          full_name: draft.full_name.trim(),
          headline: draft.headline.trim() || undefined,
          bio: draft.bio.trim() || undefined,
          location: draft.location.trim() || undefined,
          avatar_url: draft.avatar_url.trim() || undefined,
          primary_persona: draft.primary_persona,
        },
      }),
    });

    const payload = (await response.json()) as {
      data?: { requires_onboarding?: boolean };
      error?: { message?: string };
    };

    if (!response.ok) {
      setError(payload.error?.message ?? 'Could not save your onboarding.');
      setSaving(false);
      return;
    }

    router.push(payload.data?.requires_onboarding ? '/onboarding' : '/feed');
    router.refresh();
  };

  if (loading) {
    return (
      <OnboardingShell step={1} steps={3} {...STEP_COPY[1]}>
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-[24px] bg-bg-surface" />
          <div className="h-32 animate-pulse rounded-[24px] bg-bg-surface" />
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} steps={3} {...STEP_COPY[step]}>
      <OnboardingProgress step={step} />

      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <PersonaSelectGrid
              value={draft.primary_persona}
              onChange={(value) => {
                setDraft((current) => ({ ...current, primary_persona: value }));
                setError(null);
              }}
            />
            <div className="flex justify-end">
              <Button disabled={!draft.primary_persona} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {persona ? (
              <Card
                padding="lg"
                className="rounded-[28px] border-accent/15 bg-[linear-gradient(180deg,var(--accent-glow),transparent)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>{persona.label}</Badge>
                  <p className="text-sm text-text-secondary">
                    {persona.shortDescription}
                  </p>
                </div>
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  You only need a persona, a display name, and a usable username to get into the app. The rest becomes a guided profile checklist later.
                </p>
              </Card>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">
                  Username <span className="text-danger">*</span>
                </label>
                <Input
                  value={draft.username}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      username: normalizeUsername(event.target.value),
                    }))
                  }
                  placeholder="credvia_builder"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p
                  className={[
                    'text-xs',
                    usernameStatus === 'available'
                      ? 'text-success'
                      : usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? 'text-danger'
                        : 'text-text-tertiary',
                  ].join(' ')}
                >
                  {usernameMessage ?? 'Used in your profile URL and mentions.'}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">
                  Display name <span className="text-danger">*</span>
                </label>
                <Input
                  value={draft.full_name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Credvia Builder"
                />
                <p className="text-xs text-text-tertiary">
                  This is what people see first on your profile and posts.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-border-subtle bg-bg-base px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">Add more details</div>
                  <p className="mt-1 text-sm text-text-secondary">
                    Optional right now. Helpful later for credibility, but not required to enter the app.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowOptionalDetails((current) => !current)}
                >
                  {showOptionalDetails ? 'Hide optional fields' : 'Add more details'}
                </Button>
              </div>

              {showOptionalDetails ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">Headline</label>
                    <Input
                      value={draft.headline}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, headline: event.target.value }))
                      }
                      placeholder={persona?.onboardingIntent ?? 'What should people understand quickly?'}
                    />
                    <p className="text-xs text-text-tertiary">
                      A clear one-line summary helps people trust your direction faster.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">Location</label>
                    <Input
                      value={draft.location}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, location: event.target.value }))
                      }
                      placeholder="Hyderabad"
                    />
                    <p className="text-xs text-text-tertiary">
                      Useful for discovery, but optional until you want it visible.
                    </p>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-text-primary">Bio</label>
                    <Textarea
                      value={draft.bio}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, bio: event.target.value }))
                      }
                      placeholder="A calm, credible snapshot of how you want to show up on Credvia."
                    />
                    <p className="text-xs text-text-tertiary">
                      Helpful, but not worth blocking account entry for.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!basicIdentityReady} onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <OnboardingPreviewCard
              fullName={draft.full_name}
              username={normalizedUsername}
              headline={draft.headline}
              bio={draft.bio}
              persona={draft.primary_persona}
              secondaryPersonas={[]}
              openTo={[]}
              interestTags={[]}
              expertiseTags={[]}
              location={draft.location}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Card padding="lg">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  What happens next
                </div>
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  You will enter the product immediately. Persona-aware completion prompts will help you add the richer profile details later, without blocking momentum now.
                </p>
              </Card>
              <Card padding="lg">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  Suggested next steps
                </div>
                <div className="mt-3 space-y-2">
                  {completionPreview.items
                    .filter((item) => !item.complete)
                    .slice(0, 3)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border-subtle bg-bg-base px-3 py-3 text-sm text-text-secondary"
                      >
                        <div className="font-medium text-text-primary">{item.title}</div>
                        <p className="mt-1 text-xs leading-5 text-text-tertiary">{item.description}</p>
                      </div>
                    ))}
                </div>
              </Card>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={saving}>
                Back
              </Button>
              <Button onClick={() => void save()} disabled={saving || !basicIdentityReady}>
                {saving ? 'Saving...' : 'Enter Credvia'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </OnboardingShell>
  );
}
