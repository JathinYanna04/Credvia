import Link from 'next/link';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="hidden border-r border-border-subtle bg-bg-surface px-10 py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="font-display text-2xl font-semibold">Credvia</div>
        <div>
          <blockquote className="max-w-xl text-3xl font-semibold">
            Contribution creates signal. Signal creates opportunity.
          </blockquote>
          <p className="mt-4 text-sm text-text-secondary">
            Start with communities, earn reputation, and leave a body of work worth discovering.
          </p>
        </div>
        <div className="text-sm text-text-secondary">
          Web Dev, AI / ML, Internship Prep, Open Source, Startups, Resume Review, Hackathons.
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="surface-panel w-full max-w-md p-6 sm:p-8">
          <h1 className="text-3xl font-semibold">Create your account</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Build a profile backed by contribution, not polish.
          </p>
          <div className="mt-8">
            <SignupForm />
          </div>
          <p className="mt-8 text-sm text-text-secondary">
            Already inside?{' '}
            <Link href="/login" className="text-accent">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
