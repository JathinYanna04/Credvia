'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function SocialRail() {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Trending now</div>
        <div className="mt-4 space-y-3 text-sm">
          {['Internship prep', 'Agentic AI', 'Frontend systems'].map((topic) => (
            <div key={topic} className="rounded-2xl bg-bg-overlay/60 px-4 py-3 text-text-primary">
              #{topic}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Suggested paths</div>
        <div className="mt-4 space-y-3">
          <Link href="/explore/communities" className="block rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary">
            Explore communities
          </Link>
          <Link href="/ideas" className="block rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary">
            Read startup ideas
          </Link>
        </div>
      </div>
    </div>
  );
}

function CareerRail() {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Career OS</div>
        <h3 className="mt-3 text-lg font-semibold text-text-primary">Keep your profile truthful</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Resume, ATS, and match views should all agree on the same effective profile.
        </p>
      </div>
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Quick actions</div>
        <div className="mt-4 space-y-3">
          <Link href="/resume" className="block rounded-2xl bg-bg-overlay px-4 py-3 text-sm font-medium text-text-primary">
            Resume intelligence
          </Link>
          <Link href="/career/jobs" className="block rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary">
            Browse startup roles
          </Link>
          <Link href="/career-match" className="block rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary">
            Compare job fits
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RightPanel() {
  const pathname = usePathname();
  const isCareer = pathname.startsWith('/resume') || pathname.startsWith('/career');
  const isSocial =
    pathname.startsWith('/feed') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/ideas') ||
    pathname.startsWith('/u/');

  if (!isCareer && !isSocial) {
    return null;
  }

  return (
    <aside className="hidden w-[280px] shrink-0 px-4 py-6 2xl:block">
      <div className="sticky top-[92px]">
        {isCareer ? <CareerRail /> : null}
        {isSocial ? <SocialRail /> : null}
      </div>
    </aside>
  );
}
