import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="hidden border-r border-border-subtle bg-bg-surface px-10 py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="font-display text-2xl font-semibold">Credvia</div>
        <div>
          <blockquote className="max-w-xl text-3xl font-semibold">
            Proof of work should feel heavier than profile polish.
          </blockquote>
          <p className="mt-4 text-sm text-text-secondary">
            Build identity through questions, answers, projects, and visible contribution.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-display text-2xl text-accent">18k+</div>
            <div className="text-text-tertiary">Contributors</div>
          </div>
          <div>
            <div className="font-display text-2xl text-accent">240k+</div>
            <div className="text-text-tertiary">Posts</div>
          </div>
          <div>
            <div className="font-display text-2xl text-accent">7</div>
            <div className="text-text-tertiary">Communities</div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="surface-panel w-full max-w-md p-6 sm:p-8">
          <h1 className="text-3xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Continue where your last contribution left off.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-8 text-sm text-text-secondary">
            Need a public view first?{' '}
            <Link href="/" className="text-accent">
              Visit landing page
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
