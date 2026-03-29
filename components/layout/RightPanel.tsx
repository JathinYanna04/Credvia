import Link from 'next/link';
import { mockPosts, mockUsers } from '@/lib/mock-data';
import { formatCompactNumber } from '@/lib/utils/format';

export function RightPanel() {
  return (
    <aside className="hidden w-[300px] shrink-0 space-y-4 xl:block">
      <section className="surface-panel p-4">
        <h3 className="text-sm font-semibold">Trending in your communities</h3>
        <div className="mt-4 space-y-3">
          {mockPosts.slice(0, 3).map((post) => (
            <Link key={post.id} href={`/post/${post.id}`} className="block rounded-xl border border-transparent px-2 py-2 hover:border-border-subtle hover:bg-bg-overlay">
              <div className="line-clamp-2 text-sm text-text-primary">{post.title}</div>
              <div className="mt-1 text-xs text-text-secondary">
                {formatCompactNumber(post.voteScore)} votes
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="surface-panel p-4">
        <h3 className="text-sm font-semibold">People to follow</h3>
        <div className="mt-4 space-y-3">
          {mockUsers.map((user) => (
            <div key={user.id} className="rounded-xl border border-border-subtle p-3">
              <div className="text-sm text-text-primary">{user.fullName}</div>
              <div className="mt-1 text-xs text-text-secondary">{user.headline}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
