import { ok } from '@/lib/api';
import { mockCommunities, mockPosts, mockUsers } from '@/lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').toLowerCase();

  const posts = mockPosts.filter((post) => post.title.toLowerCase().includes(query));
  const communities = mockCommunities.filter((community) =>
    community.name.toLowerCase().includes(query),
  );
  const people = mockUsers.filter((user) =>
    `${user.fullName} ${user.username}`.toLowerCase().includes(query),
  );

  return ok({ posts, communities, people });
}
