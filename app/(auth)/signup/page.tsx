import Link from 'next/link';
import { AuthFormShell } from '@/components/marketing/AuthFormShell';
import { AuthShowcasePanel } from '@/components/marketing/AuthShowcasePanel';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  return (
    <div className="marketing-page min-h-screen lg:grid lg:grid-cols-2">
      <AuthShowcasePanel
        eyebrow="Contribution-led identity"
        title="Contribution creates signal. Signal creates opportunity."
        description="Build a profile shaped by useful work, then turn that signal into better career outcomes."
        highlights={[
          {
            title: 'Communities that compound',
            description: 'Join technical spaces that sharpen what people see first.',
          },
          {
            title: 'Career intelligence built in',
            description: 'Analyze your resume and improve it with grounded, useful evidence.',
          },
          {
            title: 'Professional reputation layer',
            description: 'Your identity grows every time your work helps someone else move forward.',
          },
        ]}
      />

      <AuthFormShell
        title="Create your account"
        description="Build a profile backed by contribution, not polish."
        footer={
          <>
            Already inside?{' '}
            <Link href="/login" className="text-accent transition-colors hover:text-[var(--marketing-text-primary)]">
              Sign in
            </Link>
          </>
        }
      >
        <SignupForm />
      </AuthFormShell>
    </div>
  );
}
