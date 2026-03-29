'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OAuthButton } from '@/components/auth/OAuthButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (values: LoginInput) => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword(values);
    if (signInError) {
      setError(signInError.message);
    } else {
      const profileResult = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();

      router.push(profileResult.data?.onboarding_complete ? '/feed' : '/onboarding/interests');
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <OAuthButton mode="login" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-bg-surface px-3 text-xs uppercase tracking-[0.18em] text-text-tertiary">
            Or continue with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <Input id="email" type="email" placeholder="Email" {...register('email')} />
          {formState.errors.email ? (
            <p className="border-l-2 border-danger pl-3 text-sm text-danger">
              {formState.errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <Input id="password" type="password" placeholder="Password" {...register('password')} />
          {formState.errors.password ? (
            <p className="border-l-2 border-danger pl-3 text-sm text-danger">
              {formState.errors.password.message}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>
        ) : null}

        <Button className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>New to Credvia?</span>
        <Link href="/signup" className="text-accent">
          Create account
        </Link>
      </div>
    </div>
  );
}
