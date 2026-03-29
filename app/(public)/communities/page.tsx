import Link from 'next/link';
import { mockCommunities } from '@/lib/mock-data';

export default function PublicCommunitiesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold">Communities</h1>
      <p className="mt-3 max-w-2xl text-sm text-text-secondary">
        Credvia launches with focused spaces for students, builders, and early-career professionals.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {mockCommunities.map((community) => (
          <Link key={community.id} href={`/c/${community.slug}`} className="surface-panel card-lift p-6">
            <h2 className="text-xl font-semibold">{community.name}</h2>
            <p className="mt-2 text-sm text-text-secondary">{community.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
