import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export interface FounderIdeaContextSnapshot {
  postId: string;
  founderUserId: string;
  updatedAt: string;
  revisionCount: number;
  lastRevisionAt: string;
  commentCount: number;
  stage: string;
  validationScore: number;
}

export interface FounderIdeaPromptContext extends FounderIdeaContextSnapshot {
  title: string;
  body: string;
  problem: string;
  targetAudience: string;
  solution: string;
  marketCategory: string;
  monetizationModel: string | null;
  revisions: Array<{
    revisionNumber: number;
    title: string;
    body: string;
    changeSummary: string | null;
    createdAt: string;
  }>;
  topComments: Array<{
    body: string;
    voteScore: number;
    createdAt: string;
  }>;
}

export interface FounderIdeaOwnership {
  postId: string;
  founderUserId: string;
  updatedAt: string;
}

function toText(value: string | null | undefined) {
  return (value ?? '').trim();
}

export async function getFounderIdeaOwnership(
  supabase: SupabaseClient<Database>,
  postId: string,
): Promise<FounderIdeaOwnership | null> {
  const result = await supabase
    .from('posts')
    .select('id, author_id, post_type, updated_at')
    .eq('id', postId)
    .eq('status', 'published')
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data || result.data.post_type !== 'startup_idea') {
    return null;
  }

  return {
    postId: result.data.id,
    founderUserId: result.data.author_id,
    updatedAt: result.data.updated_at,
  };
}

export async function buildFounderIdeaContextSnapshot(
  supabase: SupabaseClient<Database>,
  postId: string,
): Promise<FounderIdeaContextSnapshot | null> {
  const [postResult, startupResult] = await Promise.all([
    supabase
      .from('posts')
      .select('id, author_id, post_type, comment_count, updated_at')
      .eq('id', postId)
      .eq('status', 'published')
      .maybeSingle(),
    supabase
      .from('startup_ideas')
      .select('post_id, revision_count, last_revision_at, stage, validation_score')
      .eq('post_id', postId)
      .maybeSingle(),
  ]);

  if (postResult.error) {
    throw new Error(postResult.error.message);
  }

  if (startupResult.error) {
    throw new Error(startupResult.error.message);
  }

  if (!postResult.data || postResult.data.post_type !== 'startup_idea' || !startupResult.data) {
    return null;
  }

  return {
    postId: postResult.data.id,
    founderUserId: postResult.data.author_id,
    updatedAt: postResult.data.updated_at,
    revisionCount: startupResult.data.revision_count,
    lastRevisionAt: startupResult.data.last_revision_at,
    commentCount: postResult.data.comment_count,
    stage: startupResult.data.stage,
    validationScore: startupResult.data.validation_score,
  };
}

export async function buildFounderIdeaPromptContext(
  supabase: SupabaseClient<Database>,
  postId: string,
): Promise<FounderIdeaPromptContext | null> {
  const [postResult, startupResult, revisionsResult, commentsResult] = await Promise.all([
    supabase
      .from('posts')
      .select('id, title, body_md, post_type, status, author_id, updated_at, comment_count')
      .eq('id', postId)
      .eq('status', 'published')
      .maybeSingle(),
    supabase
      .from('startup_ideas')
      .select('post_id, problem, target_audience, solution, market_category, stage, monetization_model, validation_score, revision_count, last_revision_at')
      .eq('post_id', postId)
      .maybeSingle(),
    supabase
      .from('startup_idea_revisions')
      .select('revision_number, title, body_md, change_summary, created_at')
      .eq('post_id', postId)
      .order('revision_number', { ascending: false })
      .limit(1),
    supabase
      .from('comments')
      .select('body_md, vote_score, created_at')
      .eq('post_id', postId)
      .eq('status', 'published')
      .order('vote_score', { ascending: false })
      .limit(2),
  ]);

  if (postResult.error) {
    throw new Error(postResult.error.message);
  }

  if (startupResult.error) {
    throw new Error(startupResult.error.message);
  }

  if (revisionsResult.error) {
    throw new Error(revisionsResult.error.message);
  }

  if (commentsResult.error) {
    throw new Error(commentsResult.error.message);
  }

  if (!postResult.data || postResult.data.post_type !== 'startup_idea' || !startupResult.data) {
    return null;
  }

  return {
    postId: postResult.data.id,
    founderUserId: postResult.data.author_id,
    updatedAt: postResult.data.updated_at,
    revisionCount: startupResult.data.revision_count,
    lastRevisionAt: startupResult.data.last_revision_at,
    commentCount: postResult.data.comment_count,
    stage: startupResult.data.stage,
    validationScore: startupResult.data.validation_score,
    title: toText(postResult.data.title),
    body: toText(postResult.data.body_md),
    problem: toText(startupResult.data.problem),
    targetAudience: toText(startupResult.data.target_audience),
    solution: toText(startupResult.data.solution),
    marketCategory: toText(startupResult.data.market_category),
    monetizationModel: startupResult.data.monetization_model,
    revisions: (revisionsResult.data ?? []).map((revision) => ({
      revisionNumber: revision.revision_number,
      title: toText(revision.title),
      body: toText(revision.body_md),
      changeSummary: revision.change_summary,
      createdAt: revision.created_at,
    })),
    topComments: (commentsResult.data ?? []).map((comment) => ({
      body: toText(comment.body_md),
      voteScore: comment.vote_score,
      createdAt: comment.created_at,
    })),
  };
}
