import Link from 'next/link';
import { mockCommunities, mockUsers } from '@/lib/mock-data';

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Discover communities, people, and conversations worth your attention.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {mockCommunities.map((community) => (
          <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel card-lift p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
              Community
            </div>
            <h2 className="mt-3 text-xl font-semibold">{community.name}</h2>
            <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {mockUsers.map((user) => (
          <Link key={user.id} href={`/u/${user.username}`} className="surface-panel card-lift p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
              Person
            </div>
            <h2 className="mt-3 text-xl font-semibold">{user.fullName}</h2>
            <p className="mt-2 text-sm text-text-secondary">{user.headline}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
