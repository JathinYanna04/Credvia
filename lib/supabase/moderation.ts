import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getRequiredUser } from '@/lib/supabase/helpers';

export interface ModerationQueueItem {
  id: string;
  targetType: 'post' | 'comment' | 'profile';
  targetId: string;
  reasonCode: string;
  details: string | null;
  status: string;
  createdAt: string;
  communityId: string | null;
  communityName: string | null;
  reporterUserId: string;
  preview: string;
  aiReview?: {
    id: string;
    riskLabel: string;
    confidence: number | null;
    rationale: string;
    suggestedAction: 'dismiss' | 'hide' | 'remove';
    suggestedReason: string | null;
    evidence: unknown[];
    createdAt: string;
  } | null;
}

export interface ModerationActionItem {
  id: string;
  targetType: string;
  targetId: string;
  actionType: string;
  reason: string | null;
  createdAt: string;
}

export async function requireModeratorAccess() {
  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);
  const membershipsResult = await supabase
    .from('community_memberships')
    .select('community_id, role')
    .eq('user_id', user.id)
    .in('role', ['moderator', 'admin']);

  if (membershipsResult.error) {
    throw new Error(membershipsResult.error.message);
  }

  const communityIds = (membershipsResult.data ?? []).map((entry) => entry.community_id);
  if (communityIds.length === 0) {
    throw new Error('FORBIDDEN');
  }

  return {
    user,
    communityIds,
  };
}

export async function getModerationQueue(): Promise<ModerationQueueItem[]> {
  const { communityIds, user } = await requireModeratorAccess();
  const serviceClient = createServiceRoleClient();

  if (!serviceClient) {
    throw new Error('Missing service role client for moderation.');
  }

  const reportsResult = await serviceClient
    .from('reports')
    .select('*')
    .in('status', ['open', 'reviewed'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (reportsResult.error) {
    throw new Error(reportsResult.error.message);
  }

  const reports = reportsResult.data ?? [];
  const postIds = reports.filter((report) => report.target_type === 'post').map((report) => report.target_id);
  const commentIds = reports.filter((report) => report.target_type === 'comment').map((report) => report.target_id);

  const [postsResult, commentsResult] = await Promise.all([
    postIds.length > 0
      ? serviceClient
          .from('posts')
          .select('id, title, community_id, status')
          .in('id', postIds)
      : Promise.resolve({ data: [], error: null }),
    commentIds.length > 0
      ? serviceClient
          .from('comments')
          .select('id, body_md, post_id, status')
          .in('id', commentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (postsResult.error) {
    throw new Error(postsResult.error.message);
  }

  if (commentsResult.error) {
    throw new Error(commentsResult.error.message);
  }

  const commentPostIds = (commentsResult.data ?? []).map((comment) => comment.post_id);
  const commentPostsResult = commentPostIds.length > 0
    ? await serviceClient
        .from('posts')
        .select('id, title, community_id')
        .in('id', commentPostIds)
    : { data: [], error: null };

  if (commentPostsResult.error) {
    throw new Error(commentPostsResult.error.message);
  }

  const communityLookupIds = [
    ...(postsResult.data ?? []).map((post) => post.community_id),
    ...(commentPostsResult.data ?? []).map((post) => post.community_id),
  ];

  const communitiesResult = communityLookupIds.length > 0
    ? await serviceClient
        .from('communities')
        .select('id, name')
        .in('id', communityLookupIds)
    : { data: [], error: null };

  if (communitiesResult.error) {
    throw new Error(communitiesResult.error.message);
  }

  const posts = new Map((postsResult.data ?? []).map((post) => [post.id, post]));
  const comments = new Map((commentsResult.data ?? []).map((comment) => [comment.id, comment]));
  const commentPosts = new Map((commentPostsResult.data ?? []).map((post) => [post.id, post]));
  const communities = new Map((communitiesResult.data ?? []).map((community) => [community.id, community]));

  const queue: ModerationQueueItem[] = [];

  reports.forEach((report) => {
    if (report.target_type === 'post') {
      const post = posts.get(report.target_id);
      if (!post || !communityIds.includes(post.community_id)) {
        return;
      }

      queue.push({
        id: report.id,
        targetType: 'post',
        targetId: report.target_id,
        reasonCode: report.reason_code,
        details: report.details,
        status: report.status,
        createdAt: report.created_at,
        communityId: post.community_id,
        communityName: communities.get(post.community_id)?.name ?? null,
        reporterUserId: report.reporter_user_id,
        preview: post.title,
      });
      return;
    }

    if (report.target_type === 'comment') {
      const comment = comments.get(report.target_id);
      const parentPost = comment ? commentPosts.get(comment.post_id) : null;

      if (!comment || !parentPost || !communityIds.includes(parentPost.community_id)) {
        return;
      }

      queue.push({
        id: report.id,
        targetType: 'comment',
        targetId: report.target_id,
        reasonCode: report.reason_code,
        details: report.details,
        status: report.status,
        createdAt: report.created_at,
        communityId: parentPost.community_id,
        communityName: communities.get(parentPost.community_id)?.name ?? null,
        reporterUserId: report.reporter_user_id,
        preview: comment.body_md.slice(0, 180),
      });
    }
  });

  if (queue.length === 0) {
    return queue;
  }

  const aiReviewsResult = await serviceClient
    .from('moderation_ai_reviews')
    .select('*')
    .eq('moderator_user_id', user.id)
    .in('report_id', queue.map((item) => item.id))
    .order('created_at', { ascending: false });

  if (aiReviewsResult.error) {
    throw new Error(aiReviewsResult.error.message);
  }

  const latestReviewByReport = new Map<string, (typeof aiReviewsResult.data)[number]>();

  for (const row of aiReviewsResult.data ?? []) {
    if (!latestReviewByReport.has(row.report_id)) {
      latestReviewByReport.set(row.report_id, row);
    }
  }

  return queue.map((item) => {
    const review = latestReviewByReport.get(item.id);

    if (!review) {
      return {
        ...item,
        aiReview: null,
      };
    }

    return {
      ...item,
      aiReview: {
        id: review.id,
        riskLabel: review.risk_label,
        confidence: review.confidence,
        rationale: review.rationale,
        suggestedAction:
          review.suggested_action === 'dismiss'
          || review.suggested_action === 'hide'
          || review.suggested_action === 'remove'
            ? review.suggested_action
            : 'dismiss',
        suggestedReason: review.suggested_reason,
        evidence: Array.isArray(review.evidence) ? review.evidence : [],
        createdAt: review.created_at,
      },
    };
  });
}

export async function getModerationActions(): Promise<ModerationActionItem[]> {
  const { user } = await requireModeratorAccess();
  const serviceClient = createServiceRoleClient();

  if (!serviceClient) {
    throw new Error('Missing service role client for moderation.');
  }

  const result = await serviceClient
    .from('moderation_actions')
    .select('*')
    .eq('moderator_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((action) => ({
    id: action.id,
    targetType: action.target_type,
    targetId: action.target_id,
    actionType: action.action_type,
    reason: action.reason,
    createdAt: action.created_at,
  })) satisfies ModerationActionItem[];
}

export async function applyModerationAction(input: {
  reportId: string;
  action: 'dismiss' | 'hide' | 'remove';
  reason?: string;
  aiReviewId?: string;
  suggestedAction?: 'dismiss' | 'hide' | 'remove';
  overrideReason?: string;
}) {
  const { user, communityIds } = await requireModeratorAccess();
  const serviceClient = createServiceRoleClient();

  if (!serviceClient) {
    throw new Error('Missing service role client for moderation.');
  }

  const reportResult = await serviceClient
    .from('reports')
    .select('*')
    .eq('id', input.reportId)
    .maybeSingle();

  if (reportResult.error) {
    throw new Error(reportResult.error.message);
  }

  if (!reportResult.data) {
    throw new Error('NOT_FOUND');
  }

  const report = reportResult.data;
  let targetCommunityId: string | null = null;

  if (report.target_type === 'post') {
    const targetResult = await serviceClient
      .from('posts')
      .select('id, community_id')
      .eq('id', report.target_id)
      .maybeSingle();

    if (targetResult.error) {
      throw new Error(targetResult.error.message);
    }

    targetCommunityId = targetResult.data?.community_id ?? null;
  }

  if (report.target_type === 'comment') {
    const targetResult = await serviceClient
      .from('comments')
      .select('id, post_id')
      .eq('id', report.target_id)
      .maybeSingle();

    if (targetResult.error) {
      throw new Error(targetResult.error.message);
    }

    if (targetResult.data?.post_id) {
      const postResult = await serviceClient
        .from('posts')
        .select('community_id')
        .eq('id', targetResult.data.post_id)
        .maybeSingle();

      if (postResult.error) {
        throw new Error(postResult.error.message);
      }

      targetCommunityId = postResult.data?.community_id ?? null;
    }
  }

  if (!targetCommunityId || !communityIds.includes(targetCommunityId)) {
    throw new Error('FORBIDDEN');
  }

  const reviewedStatus = input.action === 'dismiss' ? 'dismissed' : 'actioned';
  const targetStatus = input.action === 'hide' ? 'hidden' : 'removed';

  if (input.action === 'hide' || input.action === 'remove') {
    if (report.target_type === 'post') {
      const updateResult = await serviceClient
        .from('posts')
        .update({ status: targetStatus })
        .eq('id', report.target_id);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }
    }

    if (report.target_type === 'comment') {
      const updateResult = await serviceClient
        .from('comments')
        .update({ status: targetStatus })
        .eq('id', report.target_id);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }
    }

    const actionInsert = await serviceClient
      .from('moderation_actions')
      .insert({
        moderator_user_id: user.id,
        target_type: report.target_type,
        target_id: report.target_id,
        action_type: input.action,
        reason: input.reason ?? null,
        metadata: { report_id: report.id },
      });

    if (actionInsert.error) {
      throw new Error(actionInsert.error.message);
    }
  }

  const reportUpdate = await serviceClient
    .from('reports')
    .update({
      status: reviewedStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', report.id);

  if (reportUpdate.error) {
    throw new Error(reportUpdate.error.message);
  }

  if (
    input.aiReviewId
    && input.suggestedAction
    && input.suggestedAction !== input.action
  ) {
    const reviewResult = await serviceClient
      .from('moderation_ai_reviews')
      .select('id, report_id, moderator_user_id, suggested_action')
      .eq('id', input.aiReviewId)
      .eq('report_id', report.id)
      .eq('moderator_user_id', user.id)
      .maybeSingle();

    if (reviewResult.error) {
      throw new Error(reviewResult.error.message);
    }

    if (reviewResult.data) {
      const overrideInsert = await serviceClient
        .from('moderation_ai_overrides')
        .insert({
          review_id: reviewResult.data.id,
          report_id: report.id,
          moderator_user_id: user.id,
          suggested_action: reviewResult.data.suggested_action,
          selected_action: input.action,
          override_reason: input.overrideReason ?? input.reason ?? null,
          metadata: {
            report_status_after_action: reviewedStatus,
            action_reason: input.reason ?? null,
          },
        });

      if (overrideInsert.error) {
        throw new Error(overrideInsert.error.message);
      }
    }
  }
}
