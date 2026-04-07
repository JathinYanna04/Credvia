'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OAuthButton } from '@/components/auth/OAuthButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import posthog from '@/lib/analytics/posthog-client';
import { SignupSchema, type SignupInput } from '@/lib/schemas/auth';
import { createClient } from '@/lib/supabase/client';

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
  });

  const onSubmit = async (values: SignupInput) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    posthog.capture('auth_signup_started', { method: 'email' });
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: values.email.split('@')[0] },
      },
    });
    if (signUpError) {
      setError(signUpError.message);
    } else {
      if (data.user?.id) {
        posthog.identify(data.user.id);
      }

      posthog.capture('auth_signup_completed', {
        method: 'email',
        hasSession: Boolean(data.session),
      });

      if (data.session) {
        void fetch('/api/v1/email/welcome', {
          method: 'POST',
        }).catch(() => undefined);
      }

      if (data.session) {
        router.push('/onboarding');
        router.refresh();
      } else {
        setMessage('Check your email to confirm your account, then continue through the callback link.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <OAuthButton
        mode="signup"
        onError={(nextError) => {
          setError(nextError);
          setMessage(null);
        }}
      />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--marketing-border)]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[var(--marketing-elevated)] px-3 text-xs uppercase tracking-[0.18em] text-[var(--marketing-text-muted)]">
            Or create with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label htmlFor="signup-email" className="sr-only">
          Email
        </label>
        <Input
          id="signup-email"
          type="email"
          placeholder="Email"
          className="h-11 rounded-2xl border-[var(--marketing-border)] bg-[var(--marketing-glass)] text-[var(--marketing-text-primary)] placeholder:text-[var(--marketing-text-muted)] hover:border-primary-500/30 focus-visible:ring-primary-500 focus-visible:ring-offset-[var(--marketing-elevated)]"
          {...register('email')}
        />
        <label htmlFor="signup-password" className="sr-only">
          Password
        </label>
        <Input
          id="signup-password"
          type="password"
          placeholder="Password"
          className="h-11 rounded-2xl border-[var(--marketing-border)] bg-[var(--marketing-glass)] text-[var(--marketing-text-primary)] placeholder:text-[var(--marketing-text-muted)] hover:border-primary-500/30 focus-visible:ring-primary-500 focus-visible:ring-offset-[var(--marketing-elevated)]"
          {...register('password')}
        />
        {formState.errors.email ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger">
            {formState.errors.email.message}
          </p>
        ) : null}
        {formState.errors.password ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger">
            {formState.errors.password.message}
          </p>
        ) : null}
        {error ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>
        ) : null}
        {message ? (
          <p className="border-l-2 border-accent pl-3 text-sm text-accent">{message}</p>
        ) : null}

        <Button className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-[var(--marketing-text-secondary)]">
        <span>Already have access?</span>
        <Link href="/login" className="text-accent transition-colors hover:text-[var(--marketing-text-primary)]">
          Sign in
        </Link>
      </div>
    </div>
  );
}
