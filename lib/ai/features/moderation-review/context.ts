import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export interface ModerationPromptContext {
  reportId: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  details: string | null;
  reportStatus: string;
  createdAt: string;
  communityId: string | null;
  targetPreview: string;
  priorActions: Array<{
    actionType: string;
    reason: string | null;
    createdAt: string;
  }>;
}

async function resolveTargetContext(args: {
  supabase: SupabaseClient<Database>;
  targetType: string;
  targetId: string;
}) {
  if (args.targetType === 'post') {
    const postResult = await args.supabase
      .from('posts')
      .select('id, title, body_md, community_id')
      .eq('id', args.targetId)
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    return {
      communityId: postResult.data?.community_id ?? null,
      targetPreview: [postResult.data?.title ?? '', postResult.data?.body_md ?? '']
        .filter(Boolean)
        .join(' · ')
        .slice(0, 900),
    };
  }

  if (args.targetType === 'comment') {
    const commentResult = await args.supabase
      .from('comments')
      .select('id, body_md, post_id')
      .eq('id', args.targetId)
      .maybeSingle();

    if (commentResult.error) {
      throw new Error(commentResult.error.message);
    }

    const communityResult = commentResult.data?.post_id
      ? await args.supabase
          .from('posts')
          .select('community_id')
          .eq('id', commentResult.data.post_id)
          .maybeSingle()
      : { data: null, error: null };

    if (communityResult.error) {
      throw new Error(communityResult.error.message);
    }

    return {
      communityId: communityResult.data?.community_id ?? null,
      targetPreview: (commentResult.data?.body_md ?? '').slice(0, 900),
    };
  }

  const profileResult = await args.supabase
    .from('profiles')
    .select('user_id, username, headline, bio')
    .eq('user_id', args.targetId)
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    communityId: null,
    targetPreview: [
      profileResult.data?.username ? `@${profileResult.data.username}` : '',
      profileResult.data?.headline ?? '',
      profileResult.data?.bio ?? '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 900),
  };
}

export async function buildModerationPromptContext(args: {
  supabase: SupabaseClient<Database>;
  reportId: string;
}): Promise<ModerationPromptContext | null> {
  const reportResult = await args.supabase
    .from('reports')
    .select('*')
    .eq('id', args.reportId)
    .maybeSingle();

  if (reportResult.error) {
    throw new Error(reportResult.error.message);
  }

  if (!reportResult.data) {
    return null;
  }

  const [targetContext, actionsResult] = await Promise.all([
    resolveTargetContext({
      supabase: args.supabase,
      targetType: reportResult.data.target_type,
      targetId: reportResult.data.target_id,
    }),
    args.supabase
      .from('moderation_actions')
      .select('action_type, reason, created_at')
      .eq('target_type', reportResult.data.target_type)
      .eq('target_id', reportResult.data.target_id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (actionsResult.error) {
    throw new Error(actionsResult.error.message);
  }

  return {
    reportId: reportResult.data.id,
    targetType: reportResult.data.target_type,
    targetId: reportResult.data.target_id,
    reasonCode: reportResult.data.reason_code,
    details: reportResult.data.details,
    reportStatus: reportResult.data.status,
    createdAt: reportResult.data.created_at,
    communityId: targetContext.communityId,
    targetPreview: targetContext.targetPreview,
    priorActions: (actionsResult.data ?? []).map((row) => ({
      actionType: row.action_type,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}
