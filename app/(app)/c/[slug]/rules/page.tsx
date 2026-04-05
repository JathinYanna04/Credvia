import { getCommunityPageData } from "../community-data";

export default async function CommunityRulesPage({
  params,
}: {
  params: { slug: string };
}) {
  const communityData = await getCommunityPageData(params.slug);

  return (
    <div className="surface-panel max-w-4xl p-6">
      <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
        Community rules
      </div>
      <div className="mt-4 whitespace-pre-line text-sm leading-7 text-text-secondary">
        {communityData.rules}
      </div>
    </div>
  );
}
