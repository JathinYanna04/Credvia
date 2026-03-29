import { notFound } from 'next/navigation';
import { PostCard } from '@/components/feed/PostCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { mockPosts, mockUsers } from '@/lib/mock-data';

export default function ProfilePage({ params }: { params: { username: string } }) {
  const user = mockUsers.find((item) => item.username === params.username);

  if (!user) {
    notFound();
  }

  const posts = mockPosts.filter((post) => post.author.username === user.username);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHeader user={user} />
      <div className="flex flex-wrap gap-3 border-b border-border-subtle pb-3 text-sm text-text-secondary">
        <span className="text-accent">Overview</span>
        <span>Posts</span>
        <span>Comments</span>
        <span>Reputation</span>
        <span>Saved</span>
      </div>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
