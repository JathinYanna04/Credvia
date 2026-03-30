'use client';

import { useState } from 'react';
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
  const { register, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(OnboardingProfileSchema),
    defaultValues: {
      username: 'craftingcred',
      full_name: 'Credvia Builder',
      headline: 'Early-career engineer obsessed with shipping proof-of-work.',
    },
  });

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
