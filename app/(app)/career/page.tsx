<<<<<<< HEAD
import { redirect } from 'next/navigation';
import { CareerHubPage } from '@/components/career-match/CareerHubPage';
=======
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Compass,
  FileText,
  Sparkles,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

<<<<<<< HEAD
=======
const summaryItems = [
  { label: 'Resume', value: 'Ready to upload', tone: 'secondary' as const },
  { label: 'Matches', value: 'Personalized after analysis', tone: 'accent' as const },
  { label: 'Saved jobs', value: 'Track opportunities here', tone: 'secondary' as const },
];

const nextActions = [
  {
    title: 'Upload or refresh your resume',
    description: 'Keep your profile current so matches and recommendations stay useful.',
    href: '/resume',
  },
  {
    title: 'Review your top role fit',
    description: 'See where your current skills align and which gaps matter most.',
    href: '/career-match',
  },
  {
    title: 'Browse live startup roles',
    description: 'Scan current jobs and save the most promising ones.',
    href: '/career/jobs',
  },
];

>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
export default async function CareerPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

<<<<<<< HEAD
  return <CareerHubPage />;
=======
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 py-1 sm:px-0">
      <header className="surface-panel space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Grow</Badge>
          <Badge variant="secondary">Career hub</Badge>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Career</h1>
          <p className="max-w-3xl text-sm leading-6 text-text-secondary">
            Build your resume, discover startup roles, and turn your Credvia work into real opportunities.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-2xl bg-bg-overlay px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">{item.label}</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={item.tone}>{item.value}</Badge>
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
        <div className="space-y-6">
          <article className="surface-panel space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-text-primary">
                  <FileText className="h-5 w-5 text-accent" />
                  <h2 className="text-xl font-semibold">Resume</h2>
                </div>
                <p className="text-sm leading-6 text-text-secondary">
                  Upload, analyze, and refine the resume Credvia uses for role matching and career visibility.
                </p>
              </div>
              <Badge variant="secondary">MVP critical</Badge>
            </div>
            <div className="rounded-2xl bg-bg-overlay px-4 py-4 text-sm text-text-secondary">
              Status appears after upload and analysis. If your session expires, this route should redirect to login instead of failing.
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/resume">Open resume</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/resume">Upload or improve</Link>
              </Button>
            </div>
          </article>

          <article className="surface-panel space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-text-primary">
                  <Target className="h-5 w-5 text-accent" />
                  <h2 className="text-xl font-semibold">Career Match</h2>
                </div>
                <p className="text-sm leading-6 text-text-secondary">
                  Personalized role fit based on your active resume, extracted skills, and deterministic scoring.
                </p>
              </div>
              <Badge variant="accent">Personalized for you</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-bg-overlay px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">What you get</div>
                <div className="mt-2 text-sm text-text-secondary">Role fit, matched skills, missing skills, and clear next steps.</div>
              </div>
              <div className="rounded-2xl bg-bg-overlay px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Best next step</div>
                <div className="mt-2 text-sm text-text-secondary">Run resume analysis first if your match list looks empty or stale.</div>
              </div>
            </div>
            <Button asChild>
              <Link href="/career-match">View matches</Link>
            </Button>
          </article>
        </div>

        <div className="space-y-6">
          <article className="surface-panel space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-text-primary">
              <BriefcaseBusiness className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Job Search</h2>
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              Browse public startup roles in the canonical career jobs view.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Remote</Badge>
              <Badge variant="secondary">Newest</Badge>
              <Badge variant="secondary">Public access</Badge>
            </div>
            <Button asChild className="w-full">
              <Link href="/career/jobs">Browse jobs</Link>
            </Button>
          </article>

          <article id="saved" className="surface-panel space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-text-primary">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Saved jobs and progress</h2>
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              Track opportunities you want to revisit without turning this page into a heavy dashboard.
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/career#saved">View saved section</Link>
            </Button>
          </article>

          <article className="surface-panel space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-text-primary">
              <Sparkles className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Next actions</h2>
            </div>
            <div className="space-y-3">
              {nextActions.map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="flex min-h-11 items-start justify-between gap-3 rounded-2xl bg-bg-overlay px-4 py-3 text-sm transition hover:bg-bg-base"
                >
                  <div>
                    <div className="font-medium text-text-primary">{action.title}</div>
                    <div className="mt-1 text-text-secondary">{action.description}</div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-tertiary" />
                </Link>
              ))}
            </div>
            <Link href="/explore" className="inline-flex items-center gap-2 text-sm font-medium text-accent">
              <Compass className="h-4 w-4" />
              Keep learning while you build
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
}
