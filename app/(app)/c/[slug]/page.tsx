import { PostCard } from "@/components/feed/PostCard";
import { getCommunityPosts } from "./community-data";

export default async function CommunityPage({
  params,
}: {
  params: { slug: string };
}) {
  const posts = await getCommunityPosts(params.slug);

  return (
    <div className="space-y-4">
      {posts.length === 0 ? (
        <div className="surface-panel p-5 text-sm text-text-secondary">
          No posts yet. This community is ready for the first thoughtful
          question, project, or discussion.
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
