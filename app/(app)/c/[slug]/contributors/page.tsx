import Link from "next/link";
import { getCommunityContributors } from "../community-data";

export default async function CommunityContributorsPage({
  params,
}: {
  params: { slug: string };
}) {
  const contributors = await getCommunityContributors(params.slug);

  return (
    <div className="space-y-3">
      {contributors.length === 0 ? (
        <div className="surface-panel max-w-4xl p-5 text-sm text-text-secondary">
          No contributor reputation has been recorded here yet.
        </div>
      ) : (
        contributors.map((contributor, index) => (
          <Link
            key={contributor.userId}
            href={`/u/${contributor.username}`}
            className="surface-panel flex items-center justify-between gap-4 p-5 transition-colors hover:border-border-default"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Rank #{index + 1}
              </div>
              <div className="mt-2 truncate text-base font-semibold text-text-primary">
                {contributor.fullName}
              </div>
              <div className="mt-1 truncate text-sm text-text-secondary">
                @{contributor.username}
              </div>
              <div className="mt-2 truncate text-sm text-text-secondary">
                {contributor.headline}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-semibold text-text-primary">
                {contributor.score}
              </div>
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Reputation
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
