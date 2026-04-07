import { getPersonaDefinition } from '@/lib/personas';
import { PostCard } from '@/components/feed/PostCard';
import { CommentThread } from '@/components/comments/CommentThread';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { CareerProfileBlock } from '@/components/profile/CareerProfileBlock';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPublicProfileBundle } from '@/lib/supabase/public-profile';

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const profile = await getPublicProfileBundle(params.username);
  const isOwner = currentUser?.id === profile.user.id;
  const persona = profile.user.primaryPersona ? getPersonaDefinition(profile.user.primaryPersona) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHeader
        user={profile.user}
        currentUserId={currentUser?.id ?? null}
        showFollowAction={false}
        editHref={isOwner ? '/settings' : null}
        contributionCount={profile.posts.length}
        commentCount={profile.comments.length}
      />
      <div className="sticky top-[65px] z-20 -mx-4 overflow-x-auto border-b border-border-subtle bg-bg-base/95 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:top-[73px] lg:hidden">
        <div className="inline-flex gap-2">
          <a href="#overview" className="inline-flex h-11 items-center rounded-full bg-accent px-4 text-sm font-medium text-white shadow-[0_10px_22px_rgba(79,70,229,0.22)]">
            Overview
          </a>
          <a href="#posts" className="inline-flex h-11 items-center rounded-full bg-bg-surface px-4 text-sm font-medium text-text-secondary shadow-sm ring-1 ring-border-subtle">
            Posts
          </a>
          <a href="#communities" className="inline-flex h-11 items-center rounded-full bg-bg-surface px-4 text-sm font-medium text-text-secondary shadow-sm ring-1 ring-border-subtle">
            Communities
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section id="overview" className="space-y-4">
            <div className="surface-panel p-5">
              <h2 className="text-xl font-semibold text-text-primary">Overview</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {persona
                  ? `The fastest way to understand this ${persona.label.toLowerCase()}, what they know, and where they are earning trust.`
                  : 'The fastest way to understand who this person is, what they know, and where they are earning trust.'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="surface-panel p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Trust layer</div>
                <div className="mt-3 text-2xl font-semibold text-text-primary">
                  {profile.user.scoreSummary?.credibility_score ?? 0}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Explainable credibility earned through useful work and trusted feedback.
                </p>
              </div>
              <div className="surface-panel p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Trajectory</div>
                <div className="mt-3 text-2xl font-semibold text-text-primary">
                  {typeof profile.user.growthTrajectory?.identity_confidence_score === 'number'
                    ? profile.user.growthTrajectory.identity_confidence_score
                    : profile.user.scoreSummary?.persona_completion_score ?? 0}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Higher when profile direction, contribution, and trust signals reinforce each other.
                </p>
              </div>
              <div className="surface-panel p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Contribution profile</div>
                <div className="mt-3 text-2xl font-semibold text-text-primary">
                  {profile.user.scoreSummary?.contribution_score ?? 0}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  The visible proof-of-work layer that drives discovery and opportunity.
                </p>
              </div>
            </div>

            <CareerProfileBlock isOwner={isOwner} />

            <div className="surface-panel p-5">
              <h3 className="text-lg font-semibold text-text-primary">Skills</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.user.skills.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    {persona?.emptyStateTone ?? 'No skills listed yet. Contributions still matter more than a long skill list.'}
                  </p>
                ) : (
                  profile.user.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-bg-base px-3 py-2 text-xs font-medium text-text-secondary shadow-sm ring-1 ring-border-subtle"
                    >
                      {skill}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="surface-panel p-5 lg:hidden">
              <h3 className="text-lg font-semibold text-text-primary">Recent replies</h3>
              <p className="mt-1 text-sm text-text-secondary">
                How this user participates in discussion.
              </p>
              <div className="mt-3">
                {profile.comments.length === 0 ? (
                  <p className="text-sm text-text-secondary">No public comments yet.</p>
                ) : (
                  <CommentThread comments={profile.comments.slice(0, 5)} />
                )}
              </div>
            </div>
          </section>

          <section id="posts" className="space-y-4">
            <div className="surface-panel p-5">
              <h2 className="text-xl font-semibold text-text-primary">Posts</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {persona
                  ? `${persona.label} activity, proof-of-work, and contribution that help people judge trust quickly.`
                  : 'Public questions, answers, and proof-of-work that help people judge trust quickly.'}
              </p>
            </div>
            {profile.posts.length === 0 ? (
              <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
                <p>No public posts yet.</p>
                <p>{persona?.emptyStateTone ?? 'This profile will feel much stronger once there are a few thoughtful questions, answers, or projects here.'}</p>
              </div>
            ) : (
              profile.posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </section>
        </div>

        <aside id="communities" className="space-y-4">
          <div className="surface-panel p-5">
            <h2 className="text-lg font-semibold text-text-primary">Communities</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Where this user has earned the most trust so far.
            </p>
            <div className="mt-4 space-y-3">
              {profile.user.reputation.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-default bg-bg-base px-4 py-4 text-sm text-text-secondary">
                  No reputation breakdown yet. Helpful replies and well-framed questions start the curve.
                </div>
              ) : (
                profile.user.reputation.map((item) => (
                  <div
                    key={item.communityId}
                    className="flex items-center justify-between rounded-2xl bg-bg-base px-4 py-3 shadow-sm ring-1 ring-border-subtle"
                  >
                    <div>
                      <div className="font-medium text-text-primary">{item.communityName}</div>
                      <div className="text-xs text-text-tertiary">/{item.communitySlug}</div>
                    </div>
                    <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                      {item.score}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="surface-panel hidden p-5 lg:block">
            <h2 className="text-lg font-semibold text-text-primary">Recent replies</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Recent comments that show how this user participates in discussion.
            </p>
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
