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
    defaultValues: {
      accountType: 'student',
    },
  });

  const onSubmit = async (values: SignupInput) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    posthog.capture('auth_signup_started', {
      accountType: values.accountType,
      method: 'email',
    });
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { account_type: values.accountType, full_name: values.email.split('@')[0] },
      },
    });
    if (signUpError) {
      setError(signUpError.message);
    } else {
      if (data.user?.id) {
        posthog.identify(data.user.id);
      }

      posthog.capture('auth_signup_completed', {
        accountType: values.accountType,
        method: 'email',
        hasSession: Boolean(data.session),
      });

      if (data.session) {
        void fetch('/api/v1/email/welcome', {
          method: 'POST',
        }).catch(() => undefined);
      }

      if (data.session) {
        router.push('/feed');
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
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[rgba(10,18,34,0.88)] px-3 text-xs uppercase tracking-[0.18em] text-slate-400">
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
          className="h-11 rounded-2xl border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:ring-primary-500 focus-visible:ring-offset-[#0A1222]"
          {...register('email')}
        />
        <label htmlFor="signup-password" className="sr-only">
          Password
        </label>
        <Input
          id="signup-password"
          type="password"
          placeholder="Password"
          className="h-11 rounded-2xl border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:ring-primary-500 focus-visible:ring-offset-[#0A1222]"
          {...register('password')}
        />
        <label htmlFor="account-type" className="sr-only">
          Account type
        </label>
        <select
          id="account-type"
          {...register('accountType')}
          className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition hover:border-white/20 focus:border-primary-500"
        >
          <option value="student">Student</option>
          <option value="professional">Professional</option>
          <option value="recruiter">Recruiter</option>
          <option value="founder">Founder</option>
          <option value="mentor">Mentor</option>
        </select>

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
          <p className="border-l-2 border-accent pl-3 text-sm text-primary-300">{message}</p>
        ) : null}

        <Button className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>Already have access?</span>
        <Link href="/login" className="text-primary-300 transition-colors hover:text-white">
          Sign in
        </Link>
      </div>
    </div>
  );
}
