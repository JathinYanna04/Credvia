import type { ReactNode } from "react";
import { CommunityHeader } from "@/components/community/CommunityHeader";
import { CommunityTabs } from "@/components/community/CommunityTabs";
import { getCommunityPageData } from "./community-data";

export default async function CommunityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const communityData = await getCommunityPageData(params.slug);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CommunityHeader
        community={communityData.community}
        initialJoined={communityData.initialJoined}
      />
      <CommunityTabs slug={params.slug} />
      {children}
    </div>
  );
}
