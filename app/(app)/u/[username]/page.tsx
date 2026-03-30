import { PostCard } from '@/components/feed/PostCard';
import { CommentThread } from '@/components/comments/CommentThread';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPublicProfileBundle } from '@/lib/supabase/public-profile';

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const profile = await getPublicProfileBundle(params.username);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHeader
        user={profile.user}
        showFollowAction={false}
        editHref={currentUser?.id === profile.user.id ? '/settings' : null}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent posts</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Proof-of-work and questions this user has published recently.
            </p>
          </div>
          {profile.posts.length === 0 ? (
            <div className="surface-panel p-5 text-sm text-text-secondary">
              No public posts yet.
            </div>
          ) : null}
          {profile.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>

        <aside className="space-y-4">
          <div className="surface-panel p-4">
            <h2 className="text-lg font-semibold text-text-primary">Skills</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.user.skills.length === 0 ? (
                <p className="text-sm text-text-secondary">No skills listed yet.</p>
              ) : (
                profile.user.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-secondary"
                  >
                    {skill}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="surface-panel p-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent comments</h2>
            <div className="mt-3">
              {profile.comments.length === 0 ? (
                <p className="text-sm text-text-secondary">No public comments yet.</p>
              ) : (
                <CommentThread comments={profile.comments.slice(0, 5)} />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
