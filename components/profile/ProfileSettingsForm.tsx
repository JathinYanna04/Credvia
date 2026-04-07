'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProfileCompletionChecklist } from '@/components/profile/ProfileCompletionChecklist';
import { Textarea } from '@/components/ui/textarea';
import type { ProfileCompletionState } from '@/lib/profile-completion';
import { UpdateProfileSchema } from '@/lib/schemas/profile';

type FormValues = {
  username?: string;
  full_name?: string;
  headline?: string;
  bio?: string;
  location?: string;
  current_company?: string;
  education?: string;
};

interface MePayload {
  data?: {
    user?: { id: string; email: string | null };
    profile?: {
      user_id: string;
      username: string;
      full_name: string | null;
      headline: string | null;
      bio: string | null;
      location: string | null;
      current_company: string | null;
      education: string | null;
      onboarding_complete: boolean;
    };
    profileCompletion?: ProfileCompletionState;
  };
  error?: { message?: string };
}

export function ProfileSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [publicUsername, setPublicUsername] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(true);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletionState | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      username: '',
      full_name: '',
      headline: '',
      bio: '',
      location: '',
      current_company: '',
      education: '',
    },
  });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/v1/users/me');
      const payload = (await response.json()) as MePayload;

      if (response.status === 401) {
        setAuthExpired(true);
        setLoading(false);
        return;
      }

      if (!response.ok || !payload.data?.profile) {
        throw new Error(payload.error?.message ?? 'Could not load your account.');
      }

      const profile = payload.data.profile;
      setEmail(payload.data.user?.email ?? null);
      setPublicUsername(profile.username);
      setOnboardingComplete(profile.onboarding_complete);
      setProfileCompletion(payload.data.profileCompletion ?? null);
      reset({
        username: profile.username ?? '',
        full_name: profile.full_name ?? '',
        headline: profile.headline ?? '',
        bio: profile.bio ?? '',
        location: profile.location ?? '',
        current_company: profile.current_company ?? '',
        education: profile.education ?? '',
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your account.');
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-6">
        {profileCompletion ? (
          <ProfileCompletionChecklist
            completion={profileCompletion}
            title="Keep improving your profile in layers"
            description="Credvia now separates entry from enrichment, so you can add depth when it becomes useful."
          />
        ) : null}

        <div className="surface-panel space-y-6 p-6">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Identity</div>
            <h1 className="text-3xl font-semibold">Profile settings</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Keep your public profile sharp enough for people to trust your work and understand what you are growing into.
            </p>
          </div>

          {authExpired ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              Your session expired. Sign in again to update your profile.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
              {success}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-2xl bg-bg-surface" />
              <div className="h-12 animate-pulse rounded-2xl bg-bg-surface" />
              <div className="h-24 animate-pulse rounded-2xl bg-bg-surface" />
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={handleSubmit(async (values) => {
                setSaving(true);
                setError(null);
                setSuccess(null);

                const normalizedValues = Object.fromEntries(
                  Object.entries(values).map(([key, value]) => [
                    key,
                    typeof value === 'string' ? value.trim() || undefined : value,
                  ]),
                );

                try {
                  const response = await fetch('/api/v1/users/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(normalizedValues),
                  });
                  const payload = (await response.json()) as MePayload;

                  if (response.status === 401) {
                    setAuthExpired(true);
                    setSaving(false);
                    return;
                  }

                  if (!response.ok || !payload.data) {
                    throw new Error(payload.error?.message ?? 'Could not update your profile.');
                  }

                  setPublicUsername(
                    payload.data.profile?.username ??
                      (typeof normalizedValues.username === 'string' ? normalizedValues.username : publicUsername),
                  );
                  await loadProfile();
                  setSuccess('Profile updated.');
                } catch (saveError) {
                  setError(saveError instanceof Error ? saveError.message : 'Could not update your profile.');
                } finally {
                  setSaving(false);
                }
              })}
            >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary" htmlFor="settings-username">
                  Username
                </label>
                <Input id="settings-username" {...register('username')} />
                {formState.errors.username ? (
                  <p className="text-sm text-danger">{formState.errors.username.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary" htmlFor="settings-full-name">
                  Full name
                </label>
                <Input id="settings-full-name" {...register('full_name')} />
                {formState.errors.full_name ? (
                  <p className="text-sm text-danger">{formState.errors.full_name.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="settings-headline">
                Headline
              </label>
              <Input id="settings-headline" {...register('headline')} />
              {formState.errors.headline ? (
                <p className="text-sm text-danger">{formState.errors.headline.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="settings-bio">
                Bio
              </label>
              <Textarea id="settings-bio" {...register('bio')} />
              {formState.errors.bio ? (
                <p className="text-sm text-danger">{formState.errors.bio.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary" htmlFor="settings-location">
                  Location
                </label>
                <Input id="settings-location" {...register('location')} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary" htmlFor="settings-company">
                  Current company
                </label>
                <Input id="settings-company" {...register('current_company')} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="settings-education">
                Education
              </label>
              <Input id="settings-education" {...register('education')} />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving || authExpired}>
                {saving ? 'Saving...' : 'Save profile'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void loadProfile()} disabled={saving}>
                Reset
              </Button>
              {publicUsername ? (
                <Button asChild variant="ghost">
                  <Link href={`/u/${publicUsername}`}>View public profile</Link>
                </Button>
              ) : null}
            </div>
            </form>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Profile health</div>
          <div className="mt-3 space-y-3 text-sm text-text-secondary">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Email</div>
              <div className="mt-1 text-text-primary">{email ?? 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Setup status</div>
              <div className="mt-1 text-text-primary">
                {onboardingComplete ? 'Complete' : 'Still incomplete'}
              </div>
            </div>
            {!onboardingComplete ? (
              <Link href="/onboarding" className="text-accent">
                Continue onboarding
              </Link>
            ) : null}
            <p className="text-sm text-text-secondary">
              Strong profiles do not need to be polished. A clear headline, a few skills, and consistent contribution are enough.
            </p>
          </div>
        </div>
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">What people notice first</div>
          <ul className="mt-3 space-y-3 text-sm text-text-secondary">
            <li>A clear full name and username.</li>
            <li>A headline that signals what you build or want to grow into.</li>
            <li>Consistent public contribution across the right communities.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
