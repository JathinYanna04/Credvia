import { cache } from "react";
import { notFound } from "next/navigation";
import type { CommunitySummary, PostSummary } from "@/lib/types";
import {
  getProfilesByUserIds,
  toPostSummaries,
} from "@/lib/supabase/query-helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface CommunityRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
  post_count: number;
  rules_md?: string | null;
}

export interface CommunityPageData {
  community: CommunitySummary;
  communityId: string;
  description: string;
  rules: string;
  initialJoined: boolean;
}

export interface CommunityContributor {
  userId: string;
  username: string;
  fullName: string;
  headline: string;
  score: number;
}

function toCommunitySummary(community: CommunityRecord): CommunitySummary {
  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description ?? "",
    icon: community.name
      .split(" ")
      .map((chunk) => chunk[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    memberCount: community.member_count,
    postCount: community.post_count,
    accent: "var(--accent)",
  };
}

export const getCommunityPageData = cache(
  async (slug: string): Promise<CommunityPageData> => {
    const supabase = await createServerSupabaseClient();
    const [communityResult, authResult] = await Promise.all([
      supabase
        .from("communities")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);

    if (communityResult.error || !communityResult.data) {
      notFound();
    }

    const communityRow = communityResult.data as unknown as CommunityRecord;
    const userId = authResult.data.user?.id ?? null;
    const joinedResult = userId
      ? await supabase
          .from("community_memberships")
          .select("community_id")
          .eq("user_id", userId)
          .eq("community_id", communityRow.id)
          .maybeSingle()
      : { data: null, error: null };

    return {
      community: toCommunitySummary(communityRow),
      communityId: communityRow.id,
      description: communityRow.description ?? "",
      rules:
        communityRow.rules_md?.trim() ||
        `Keep posts relevant to ${communityRow.name}, explain your context clearly, and aim to leave the discussion more useful than you found it.`,
      initialJoined: Boolean(joinedResult.data),
    };
  },
);

export async function getCommunityPosts(slug: string): Promise<PostSummary[]> {
  const communityData = await getCommunityPageData(slug);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const postsResult = await supabase
    .from("posts")
    .select("*")
    .eq("community_id", communityData.communityId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (postsResult.error) {
    throw new Error(postsResult.error.message);
  }

  return toPostSummaries(supabase, postsResult.data ?? [], user?.id ?? null);
}

export async function getCommunityContributors(
  slug: string,
): Promise<CommunityContributor[]> {
  const communityData = await getCommunityPageData(slug);
  const supabase = await createServerSupabaseClient();
  const reputationResult = await supabase
    .from("community_reputation")
    .select("user_id, score")
    .eq("community_id", communityData.communityId)
    .order("score", { ascending: false })
    .limit(24);

  if (reputationResult.error) {
    throw new Error(reputationResult.error.message);
  }

  const userIds = (reputationResult.data ?? []).map((entry) => entry.user_id);
  const profiles = await getProfilesByUserIds(supabase, userIds);

  return (reputationResult.data ?? []).map((entry) => {
    const profile = profiles.get(entry.user_id);

    return {
      userId: entry.user_id,
      username: profile?.username ?? `user_${entry.user_id.slice(0, 8)}`,
      fullName: profile?.full_name ?? profile?.username ?? "Credvia User",
      headline: profile?.headline ?? "Community member",
      score: entry.score,
    };
  });
}
