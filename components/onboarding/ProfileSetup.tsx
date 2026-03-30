'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OnboardingProfileSchema } from '@/lib/schemas/auth';

type FormValues = {
  username: string;
  full_name: string;
  headline: string;
  bio?: string;
  location?: string;
};

export interface ProfileSetupProps {
  onComplete?: () => void;
}

export function ProfileSetup({ onComplete }: ProfileSetupProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const { register, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(OnboardingProfileSchema),
    defaultValues: {
      username: '',
      full_name: '',
      headline: '',
      bio: '',
      location: '',
    },
  });

  useEffect(() => {
    void fetch('/api/v1/users/me')
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: {
            profile?: {
              username?: string | null;
              full_name?: string | null;
              headline?: string | null;
              bio?: string | null;
              location?: string | null;
            };
          };
          error?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load your profile.');
        }

        const profile = payload.data?.profile;
        reset({
          username: profile?.username ?? '',
          full_name: profile?.full_name ?? '',
          headline: profile?.headline ?? '',
          bio: profile?.bio ?? '',
          location: profile?.location ?? '',
        });
      })
      .catch((profileError) => {
        setError(profileError instanceof Error ? profileError.message : 'Could not load your profile.');
      })
      .finally(() => {
        setLoadingProfile(false);
      });
  }, [reset]);

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        setError(null);

        const response = await fetch('/api/v1/users/me/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: values,
            onboarding_complete: true,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: { message?: string } };
          setError(payload.error?.message ?? 'Could not complete onboarding.');
          return;
        }

        onComplete?.();
        router.push('/feed');
        router.refresh();
      })}
      className="grid gap-4"
    >
      {loadingProfile ? (
        <p className="text-sm text-text-secondary">Loading your profile…</p>
      ) : null}
      <Input placeholder="Username" {...register('username')} />
      <Input placeholder="Full name" {...register('full_name')} />
      <Input placeholder="Headline" {...register('headline')} />
      <Textarea placeholder="Bio" {...register('bio')} />
      <Input placeholder="Location" {...register('location')} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit">Complete onboarding</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            setError(null);
            const response = await fetch('/api/v1/users/me/onboarding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                profile: {},
                onboarding_complete: true,
              }),
            });

            if (!response.ok) {
              const payload = (await response.json()) as { error?: { message?: string } };
              setError(payload.error?.message ?? 'Could not skip onboarding.');
              return;
            }

            onComplete?.();
            router.push('/feed');
            router.refresh();
          }}
        >
          Skip for now
        </Button>
      </div>
    </form>
  );
}
