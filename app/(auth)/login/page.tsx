import Link from 'next/link';
import { AuthFormShell } from '@/components/marketing/AuthFormShell';
import { AuthShowcasePanel } from '@/components/marketing/AuthShowcasePanel';
import { LoginForm } from '@/components/auth/LoginForm';

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawError = resolvedSearchParams?.error;
  const initialError = Array.isArray(rawError) ? rawError[0] : rawError ?? null;

  return (
    <div className="marketing-page min-h-screen lg:grid lg:grid-cols-2">
      <AuthShowcasePanel
        eyebrow="Career momentum"
        title="Your next opportunity should be grounded in signal, not guesswork."
        description="Resume intelligence, ATS scoring, career match, and community reputation all live in one premium workspace."
        highlights={[
          {
            title: 'AI-powered resume workspace',
            description: 'Truthful diagnostics, review, and downstream scoring in one flow.',
          },
          {
            title: 'Professional identity graph',
            description: 'Contribution, reputation, and visible proof-of-work compound together.',
          },
          {
            title: 'Career-first product system',
            description: 'Upload, improve, match, and grow without bouncing across disconnected tools.',
          },
        ]}
      />

      <AuthFormShell
        title="Welcome back"
        description="Continue where your last contribution left off."
        footer={
          <>
            Need a public view first?{' '}
            <Link href="/" className="text-primary-300 transition-colors hover:text-white">
              Visit landing page
            </Link>
          </>
        }
      >
        <LoginForm initialError={initialError} />
      </AuthFormShell>
    </div>
  );
}
