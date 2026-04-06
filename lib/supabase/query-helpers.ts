import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCredibilityBadge,
  getPersonaDetails,
  normalizePersonaSlug,
  type OpenToValue,
  OPEN_TO_VALUES,
  type ProfileIntent,
  PROFILE_INTENT_VALUES,
} from '@/lib/personas';
import type { Database } from "@/lib/supabase/types";
import type {
  CommentSummary,
  CommunitySummary,
  NotificationSummary,
  PostSummary,
  StartupIdeaRevisionSummary,
  UserSummary,
} from "@/lib/types";
import { isMissingStartupIdeaAdvancedSchemaError } from "@/lib/supabase/startup-idea-schema";
import { computeIdeaValidationScore } from "@/lib/utils/idea-score";
import { buildServerVersion } from '@/lib/voting';

export type TypedSupabaseClient = SupabaseClient<Database>;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
type CommunityReputationRow =
  Database["public"]["Tables"]["community_reputation"]["Row"];
type StartupIdeaRow = Database["public"]["Tables"]["startup_ideas"]["Row"];
type StartupIdeaRevisionRow =
  Database["public"]["Tables"]["startup_idea_revisions"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type StartupIdeaStage = NonNullable<PostSummary["startupIdea"]>["stage"];
type VoteRow = Database["public"]["Tables"]["votes"]["Row"];

interface VoteCounterSummary {
  upvoteCount: number;
  downvoteCount: number;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function getProfilesByUserIds(
  supabase: TypedSupabaseClient,
  userIds: string[],
) {
  const ids = unique(userIds);

  if (ids.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("user_id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
  );
}

export async function getCommunitiesByIds(
  supabase: TypedSupabaseClient,
  communityIds: string[],
) {
  const ids = unique(communityIds);

  if (ids.length === 0) {
    return new Map<string, CommunityRow>();
  }

  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as CommunityRow[]).map((community) => [
      community.id,
      community,
    ]),
  );
}

export async function getCommunityReputation(
  supabase: TypedSupabaseClient,
  userIds: string[],
  communityIds: string[],
) {
  const resolvedUserIds = unique(userIds);
  const resolvedCommunityIds = unique(communityIds);

  if (resolvedUserIds.length === 0 || resolvedCommunityIds.length === 0) {
    return new Map<string, CommunityReputationRow>();
  }

  const { data, error } = await supabase
    .from("community_reputation")
    .select("*")
    .in("user_id", resolvedUserIds)
    .in("community_id", resolvedCommunityIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as CommunityReputationRow[]).map((entry) => [
      `${entry.user_id}:${entry.community_id}`,
      entry,
    ]),
  );
}

export async function getStartupIdeasByPostIds(
  supabase: TypedSupabaseClient,
  postIds: string[],
) {
  const ids = unique(postIds);

  if (ids.length === 0) {
    return new Map<string, StartupIdeaRow>();
  }

  const { data, error } = await supabase
    .from("startup_ideas")
    .select("*")
    .in("post_id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as StartupIdeaRow[]).map((idea) => [idea.post_id, idea]),
  );
}

export async function getStartupIdeaRevisionsByPostIds(
  supabase: TypedSupabaseClient,
  postIds: string[],
) {
  const ids = unique(postIds);

  if (ids.length === 0) {
    return new Map<string, StartupIdeaRevisionSummary[]>();
  }

  const { data, error } = await supabase
    .from("startup_idea_revisions")
    .select("*")
    .in("post_id", ids)
    .order("revision_number", { ascending: false });

  if (error) {
    if (isMissingStartupIdeaAdvancedSchemaError(error)) {
      return new Map<string, StartupIdeaRevisionSummary[]>();
    }
    throw new Error(error.message);
  }

  const revisions = new Map<string, StartupIdeaRevisionSummary[]>();

  ((data ?? []) as StartupIdeaRevisionRow[]).forEach((revision) => {
    if (!revisions.has(revision.post_id)) {
      revisions.set(revision.post_id, []);
    }

    revisions.get(revision.post_id)?.push({
      id: revision.id,
      revisionNumber: revision.revision_number,
      title: revision.title,
      body: revision.body_md ?? "",
      problem: revision.problem,
      targetAudience: revision.target_audience,
      solution: revision.solution,
      marketCategory: revision.market_category,
      stage: revision.stage as StartupIdeaStage,
      monetizationModel: revision.monetization_model ?? undefined,
      changeSummary: revision.change_summary ?? undefined,
      createdAt: revision.created_at,
    });
  });

  return revisions;
}

export async function getCurrentUserVotesByEntityIds(
  supabase: TypedSupabaseClient,
  viewerId: string | null | undefined,
  entityType: "post" | "comment",
  entityIds: string[],
) {
  const ids = unique(entityIds);

  if (!viewerId || ids.length === 0) {
    return new Map<string, -1 | 0 | 1>();
  }

  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("user_id", viewerId)
    .eq("entity_type", entityType)
    .in("entity_id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as VoteRow[]).map((vote) => [
      vote.entity_id,
      vote.value as -1 | 1,
    ]),
  );
}

export async function getVoteCountersByEntityIds(
  supabase: TypedSupabaseClient,
  entityType: "post" | "comment",
  entityIds: string[],
) {
  const ids = unique(entityIds);

  if (ids.length === 0) {
    return new Map<string, VoteCounterSummary>();
  }

  const { data, error } = await supabase
    .from("votes")
    .select("entity_id, value")
    .eq("entity_type", entityType)
    .in("entity_id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const counters = new Map<string, VoteCounterSummary>();

  for (const vote of (data ?? []) as Pick<VoteRow, "entity_id" | "value">[]) {
    const existing = counters.get(vote.entity_id) ?? {
      upvoteCount: 0,
      downvoteCount: 0,
    };

    if (vote.value === 1) {
      existing.upvoteCount += 1;
    }

    if (vote.value === -1) {
      existing.downvoteCount += 1;
    }

    counters.set(vote.entity_id, existing);
  }

  return counters;
}

export async function getUniqueCommenterCounts(
  supabase: TypedSupabaseClient,
  postIds: string[],
) {
  const ids = unique(postIds);

  if (ids.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await supabase
    .from("comments")
    .select("post_id, author_id")
    .in("post_id", ids)
    .eq("status", "published");

  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, Set<string>>();

  (data ?? []).forEach((comment) => {
    if (!counts.has(comment.post_id)) {
      counts.set(comment.post_id, new Set<string>());
    }

    counts.get(comment.post_id)?.add(comment.author_id);
  });

  return new Map(
    [...counts.entries()].map(([postId, authorIds]) => [
      postId,
      authorIds.size,
    ]),
  );
}

function toCommunitySummary(community: CommunityRow): CommunitySummary {
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

function toUserSummary(
  userId: string,
  profile: ProfileRow | undefined,
  community: CommunityRow | undefined,
  reputationMap: Map<string, CommunityReputationRow>,
): UserSummary {
  const repKey = community ? `${userId}:${community.id}` : "";
  const rep = community ? reputationMap.get(repKey) : null;

  return {
    id: userId,
    username: profile?.username ?? `user_${userId.slice(0, 8)}`,
    fullName: profile?.full_name ?? profile?.username ?? "Credvia User",
    headline: profile?.headline ?? "",
    avatarUrl: profile?.avatar_url ?? "",
    primaryPersona: normalizePersonaSlug(profile?.primary_persona) ?? undefined,
    secondaryPersonas:
      (profile?.secondary_personas ?? [])
        .map((persona) => normalizePersonaSlug(persona))
        .filter((persona): persona is NonNullable<typeof persona> => Boolean(persona)) ?? [],
    profileIntent: (profile?.profile_intent ?? []).filter((item): item is ProfileIntent =>
      PROFILE_INTENT_VALUES.includes(item as (typeof PROFILE_INTENT_VALUES)[number]),
    ),
    openTo: (profile?.open_to ?? []).filter((item): item is OpenToValue =>
      OPEN_TO_VALUES.includes(item as (typeof OPEN_TO_VALUES)[number]),
    ),
    expertiseTags: profile?.expertise_tags ?? [],
    interestTags: profile?.interest_tags ?? [],
    personaDetails: getPersonaDetails(
      profile?.metadata ?? null,
      normalizePersonaSlug(profile?.primary_persona),
    ),
    skills: [],
    location: profile?.location ?? undefined,
    website: profile?.website ?? undefined,
    currentCompany: profile?.current_company ?? undefined,
    scoreSummary: {
      contribution_score: profile?.contribution_score ?? 0,
      credibility_score: profile?.credibility_score ?? 0,
      helpfulness_score: profile?.helpfulness_score ?? 0,
      expertise_score: profile?.expertise_score ?? 0,
      community_score: profile?.community_score ?? 0,
      persona_completion_score: profile?.persona_completion_score ?? 0,
    },
    badge: getCredibilityBadge({
      contributionScore: profile?.contribution_score,
      credibilityScore: profile?.credibility_score,
      helpfulnessScore: profile?.helpfulness_score,
    }),
    contributionProfile:
      profile?.contribution_profile && typeof profile.contribution_profile === 'object'
        ? (profile.contribution_profile as Record<string, unknown>)
        : undefined,
    trustProfile:
      profile?.trust_profile && typeof profile.trust_profile === 'object'
        ? (profile.trust_profile as Record<string, unknown>)
        : undefined,
    growthTrajectory:
      profile?.growth_trajectory && typeof profile.growth_trajectory === 'object'
        ? (profile.growth_trajectory as Record<string, unknown>)
        : undefined,
    behavioralSignals:
      profile?.behavioral_signals && typeof profile.behavioral_signals === 'object'
        ? (profile.behavioral_signals as Record<string, unknown>)
        : undefined,
    reputation: community
      ? [
          {
            communityId: community.id,
            communityName: community.name,
            communitySlug: community.slug,
            score: rep?.score ?? 0,
          },
        ]
      : [],
  };
}

export async function toPostSummaries(
  supabase: TypedSupabaseClient,
  posts: PostRow[],
  viewerId?: string | null,
): Promise<PostSummary[]> {
  const [
    profiles,
    communities,
    communityRep,
    startupIdeas,
    uniqueCommenterCounts,
    currentUserVotes,
    voteCounters,
  ] = await Promise.all([
    getProfilesByUserIds(
      supabase,
      posts.map((post) => post.author_id),
    ),
    getCommunitiesByIds(
      supabase,
      posts.map((post) => post.community_id),
    ),
    getCommunityReputation(
      supabase,
      posts.map((post) => post.author_id),
      posts.map((post) => post.community_id),
    ),
    getStartupIdeasByPostIds(
      supabase,
      posts.map((post) => post.id),
    ),
    getUniqueCommenterCounts(
      supabase,
      posts.map((post) => post.id),
    ),
    getCurrentUserVotesByEntityIds(
      supabase,
      viewerId,
      "post",
      posts.map((post) => post.id),
    ),
    getVoteCountersByEntityIds(
      supabase,
      "post",
      posts.map((post) => post.id),
    ),
  ]);

  return posts.map((post) => {
    const community = communities.get(post.community_id);
    const authorProfile = profiles.get(post.author_id);
    const startupIdea = startupIdeas.get(post.id);
    const uniqueCommenters = uniqueCommenterCounts.get(post.id) ?? 0;
    const voteCounter = voteCounters.get(post.id);

    return {
      id: post.id,
      title: post.title,
      body: post.body_md ?? "",
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      version: buildServerVersion(post.updated_at),
      postType: post.post_type as PostSummary["postType"],
      voteScore: post.vote_score,
      upvoteCount: voteCounter?.upvoteCount,
      downvoteCount: voteCounter?.downvoteCount,
      currentUserVote: currentUserVotes.get(post.id) ?? 0,
      commentCount: post.comment_count,
      saveCount: post.save_count,
      author: toUserSummary(
        post.author_id,
        authorProfile,
        community,
        communityRep,
      ),
      community: community
        ? toCommunitySummary(community)
        : {
            id: post.community_id,
            name: "Unknown Community",
            slug: "unknown",
            description: "",
            icon: "UC",
            memberCount: 0,
            postCount: 0,
            accent: "var(--accent)",
          },
      tags: [],
      unanswered: post.post_type === "question" && post.comment_count === 0,
      externalUrl: post.external_url ?? undefined,
      startupIdea: startupIdea
        ? {
            problem: startupIdea.problem,
            targetAudience: startupIdea.target_audience,
            solution: startupIdea.solution,
            marketCategory: startupIdea.market_category,
            stage: startupIdea.stage as StartupIdeaStage,
            monetizationModel: startupIdea.monetization_model ?? undefined,
            validationScore: computeIdeaValidationScore({
              voteScore: post.vote_score,
              commentCount: post.comment_count,
              saveCount: post.save_count,
              uniqueCommenters,
              createdAt: post.created_at,
            }),
            uniqueCommenters,
            followerCount: startupIdea.follower_count ?? 0,
            revisionCount: startupIdea.revision_count ?? 1,
            lastRevisionAt: startupIdea.last_revision_at ?? undefined,
            currentRevisionId: startupIdea.current_revision_id ?? undefined,
          }
        : undefined,
    };
  });
}

export async function toCommentSummaries(
  supabase: TypedSupabaseClient,
  comments: CommentRow[],
  communityId: string,
  viewerId?: string | null,
): Promise<CommentSummary[]> {
  const [profiles, communities, reputation, currentUserVotes, voteCounters] = await Promise.all([
    getProfilesByUserIds(
      supabase,
      comments.map((comment) => comment.author_id),
    ),
    getCommunitiesByIds(supabase, [communityId]),
    getCommunityReputation(
      supabase,
      comments.map((comment) => comment.author_id),
      [communityId],
    ),
    getCurrentUserVotesByEntityIds(
      supabase,
      viewerId,
      'comment',
      comments.map((comment) => comment.id),
    ),
    getVoteCountersByEntityIds(
      supabase,
      'comment',
      comments.map((comment) => comment.id),
    ),
  ]);
  const community = communities.get(communityId);

  const commentMap = new Map<string, CommentSummary & { parentId?: string }>();

  comments.forEach((comment) => {
    const voteCounter = voteCounters.get(comment.id);

    commentMap.set(comment.id, {
      id: comment.id,
      author: toUserSummary(
        comment.author_id,
        profiles.get(comment.author_id),
        community,
        reputation,
      ),
      body: comment.body_md,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      version: buildServerVersion(comment.updated_at),
      voteScore: comment.vote_score,
      upvoteCount: voteCounter?.upvoteCount,
      downvoteCount: voteCounter?.downvoteCount,
      currentUserVote: currentUserVotes.get(comment.id) ?? 0,
      isBestAnswer: comment.is_best_answer,
      replies: [],
      parentId: comment.parent_comment_id ?? undefined,
    });
  });

  const roots: (CommentSummary & { parentId?: string })[] = [];

  commentMap.forEach((comment) => {
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      parent?.replies?.push(comment);
      return;
    }

    roots.push(comment);
  });

  return roots.map(({ parentId: _parentId, ...comment }) => comment);
}

function toNotificationDescription(notification: NotificationRow) {
  switch (notification.notif_type) {
    case "reply":
      return "replied to your post.";
    case "vote":
      return "voted on your post.";
    case "follow":
      return notification.entity_type === "post"
        ? "followed your startup idea."
        : "followed your profile.";
    case "idea_revision":
      return "published a new startup idea revision.";
    case "mod_action":
      return "took moderation action on reported content.";
    default:
      return "interacted with your work.";
  }
}

export async function toNotificationSummaries(
  supabase: TypedSupabaseClient,
  notifications: NotificationRow[],
): Promise<NotificationSummary[]> {
  const actorIds = notifications
    .map((notification) => notification.actor_user_id)
    .filter((value): value is string => Boolean(value));
  const profiles = await getProfilesByUserIds(supabase, actorIds);

  return notifications.map((notification) => {
    const actorId = notification.actor_user_id ?? "system";
    const actorProfile = profiles.get(actorId);

    return {
      id: notification.id,
      type: notification.notif_type as NotificationSummary["type"],
      actor: actorProfile
        ? {
            id: actorId,
            username: actorProfile.username,
            fullName: actorProfile.full_name ?? actorProfile.username,
            headline: actorProfile.headline ?? "",
            avatarUrl: actorProfile.avatar_url ?? "",
            skills: [],
            location: actorProfile.location ?? undefined,
            currentCompany: actorProfile.current_company ?? undefined,
            reputation: [],
          }
        : {
            id: actorId,
            username: "credvia",
            fullName: "Credvia",
            headline: "",
            avatarUrl: "",
            skills: [],
            reputation: [],
          },
      description: toNotificationDescription(notification),
      entityId: notification.entity_id ?? undefined,
      entityType: notification.entity_type ?? undefined,
      createdAt: notification.created_at,
      unread: !notification.read_at,
    };
  });
}
