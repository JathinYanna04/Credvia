import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockCommunities, mockPosts } from '@/lib/mock-data';

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden">
      <section className="relative border-b border-border-subtle">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative mx-auto flex max-w-shell flex-col px-4 py-24 sm:px-6">
          <div className="max-w-4xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.28em] text-accent">
              Dark-Forge Precision
            </p>
            <h1 className="max-w-4xl text-balance text-4xl font-semibold sm:text-6xl">
              Build reputation through contribution.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-text-secondary">
              Credvia blends technical community depth, professional identity, and earned proof-of-work into one system.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start Building
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/communities">Browse communities</Link>
              </Button>
            </div>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {mockCommunities.map((community, index) => (
              <article
                key={community.id}
                className="surface-panel card-lift p-5"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="text-sm text-accent">{community.icon}</div>
                <h2 className="mt-4 text-xl font-semibold">{community.name}</h2>
                <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
                <p className="mt-6 text-xs uppercase tracking-[0.2em] text-text-tertiary">
                  {community.memberCount.toLocaleString()} members
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-shell px-4 py-20 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['18k+', 'Active users'],
            ['240k+', 'Knowledge exchanges'],
            ['7', 'Launch communities'],
          ].map(([value, label]) => (
            <div key={label} className="surface-panel p-6">
              <div className="font-display text-4xl font-semibold text-accent">{value}</div>
              <div className="mt-2 text-sm text-text-secondary">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          {mockPosts.slice(0, 2).map((post) => (
            <article key={post.id} className="surface-panel p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Featured from {post.community.name}
              </div>
              <h3 className="mt-3 text-2xl font-semibold">{post.title}</h3>
              <p className="mt-3 text-sm text-text-secondary">{post.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
