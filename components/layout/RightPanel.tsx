'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getPersonaDefinition, normalizePersonaSlug, type PersonaSlug } from '@/lib/personas';

function SocialRail({ persona }: { persona: PersonaSlug | null }) {
  const personaDefinition = persona ? getPersonaDefinition(persona) : null;
  const trendingTopics = persona === 'founder'
    ? ['Startup validation', 'GTM loops', 'First users']
    : persona === 'recruiter'
      ? ['Hiring signals', 'Candidate discovery', 'Talent stories']
      : persona === 'mentor'
        ? ['Advice requests', 'Career reviews', 'Builder questions']
        : ['Internship prep', 'Agentic AI', 'Frontend systems'];
  const pathLinks = persona === 'founder'
    ? [
        { href: '/ideas', label: 'Review startup ideas' },
        { href: '/post/new', label: 'Share a build update' },
      ]
    : persona === 'recruiter'
      ? [
          { href: '/career/jobs', label: 'Hiring radar' },
          { href: '/explore', label: 'Discover people' },
        ]
      : [
          { href: '/explore/communities', label: 'Explore communities' },
          { href: '/ideas', label: 'Read startup ideas' },
        ];

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Trending now</div>
        <div className="mt-4 space-y-3 text-sm">
          {trendingTopics.map((topic) => (
            <div key={topic} className="rounded-2xl bg-bg-overlay/60 px-4 py-3 text-text-primary">
              #{topic}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
          {personaDefinition ? `${personaDefinition.label} paths` : 'Suggested paths'}
        </div>
        <div className="mt-4 space-y-3">
          {pathLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
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
  const [persona, setPersona] = useState<PersonaSlug | null>(null);
  const isCareer = pathname.startsWith('/resume') || pathname.startsWith('/career');
  const isSocial =
    pathname.startsWith('/feed') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/ideas') ||
    pathname.startsWith('/u/');

  useEffect(() => {
    fetch('/api/v1/users/me')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          data?: { profile?: { primary_persona?: string | null } };
        };

        setPersona(normalizePersonaSlug(payload.data?.profile?.primary_persona));
      })
      .catch(() => undefined);
  }, []);

  if (!isCareer && !isSocial) {
    return null;
  }

  return (
    <aside className="hidden w-[280px] shrink-0 px-4 py-6 2xl:block">
      <div className="sticky top-[92px]">
        {isCareer ? <CareerRail /> : null}
        {isSocial ? <SocialRail persona={persona} /> : null}
      </div>
    </aside>
  );
}
