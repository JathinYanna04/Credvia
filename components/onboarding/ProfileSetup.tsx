'use client';

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
        await fetch('/api/v1/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            onboarding_complete: true,
          }),
        });

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
      <div className="flex gap-3">
        <Button type="submit">Complete onboarding</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await fetch('/api/v1/users/me', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ onboarding_complete: true }),
            });

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
