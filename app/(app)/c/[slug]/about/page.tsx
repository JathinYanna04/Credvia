import { getCommunityPageData } from "../community-data";

export default async function CommunityAboutPage({
  params,
}: {
  params: { slug: string };
}) {
  const communityData = await getCommunityPageData(params.slug);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <section className="surface-panel p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
          About this community
        </div>
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-text-secondary">
          {communityData.description ||
            `${communityData.community.name} is a focused space for people who want sharper, more relevant conversations in this domain.`}
        </p>
      </section>

      <aside className="surface-panel p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
          Snapshot
        </div>
        <div className="mt-4 space-y-4 text-sm text-text-secondary">
          <div>
            <div className="text-2xl font-semibold text-text-primary">
              {communityData.community.memberCount}
            </div>
            <div>Members</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-text-primary">
              {communityData.community.postCount}
            </div>
            <div>Published posts</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
