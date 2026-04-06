import { fail, ok, handleApiError } from "@/lib/api";
import type { CommentSummary, PostSummary } from '@/lib/types';
import { buildServerVersion } from '@/lib/voting';
import { isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  toCommentSummaries,
  toPostSummaries,
} from "@/lib/supabase/query-helpers";
import { logError, logInfo } from '@/lib/utils/logger';

function toFallbackPostSummary(post: Record<string, unknown>): PostSummary {
  const postId = typeof post.id === 'string' ? post.id : '';
  const authorId = typeof post.author_id === 'string' ? post.author_id : '';
  const communityId = typeof post.community_id === 'string' ? post.community_id : '';
  const updatedAt = typeof post.updated_at === 'string' ? post.updated_at : new Date().toISOString();
  const createdAt = typeof post.created_at === 'string' ? post.created_at : updatedAt;

  return {
    id: postId,
    title: typeof post.title === 'string' ? post.title : 'Untitled post',
    body: typeof post.body_md === 'string' ? post.body_md : '',
    createdAt,
    updatedAt,
    version: buildServerVersion(updatedAt),
    postType:
      post.post_type === 'question' ||
      post.post_type === 'discussion' ||
      post.post_type === 'project_showcase' ||
      post.post_type === 'resource' ||
      post.post_type === 'opportunity' ||
      post.post_type === 'resume_review' ||
      post.post_type === 'looking_for_collaborator' ||
      post.post_type === 'startup_idea'
        ? post.post_type
        : 'discussion',
    voteScore: typeof post.vote_score === 'number' ? post.vote_score : 0,
    currentUserVote: 0,
    commentCount: typeof post.comment_count === 'number' ? post.comment_count : 0,
    saveCount: typeof post.save_count === 'number' ? post.save_count : 0,
    author: {
      id: authorId,
      username: `user_${authorId.slice(0, 8)}`,
      fullName: 'Credvia User',
      headline: '',
      avatarUrl: '',
      skills: [],
      reputation: [],
    },
    community: {
      id: communityId,
      name: 'Unknown Community',
      slug: 'unknown',
      description: '',
      icon: 'UC',
      memberCount: 0,
      postCount: 0,
      accent: 'var(--accent)',
    },
    tags: [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const verboseLogging = process.env.NODE_ENV !== 'production';
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authUserId = user?.id ?? null;

    if (verboseLogging) {
      logInfo('api-post-detail', 'Post detail request received', {
        postId: params.id,
        userId: authUserId,
      });
    }

    const postResult = await supabase
      .from("posts")
      .select("*")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail("NOT_FOUND", "Post not found.", 404);
    }

    let post: PostSummary | undefined;

    try {
      [post] = await toPostSummaries(supabase, [postResult.data], user?.id);
    } catch (summaryError) {
      const summaryErrorForClassification =
        summaryError instanceof Error
          ? summaryError
          : typeof summaryError === 'object' && summaryError !== null
            ? (summaryError as { message?: string; code?: string })
            : undefined;

      if (!isRecoverableSupabaseReadError(summaryErrorForClassification)) {
        throw summaryError;
      }

      if (verboseLogging) {
        logInfo('api-post-detail', 'Recoverable post enrichment failure, using fallback summary', {
          postId: params.id,
          userId: authUserId,
          error:
            summaryError instanceof Error
              ? summaryError.message
              : 'Unknown recoverable post enrichment error',
        });
      }

      post = toFallbackPostSummary(postResult.data as Record<string, unknown>);
    }

    if (!post) {
      return fail("NOT_FOUND", "Post not found.", 404);
    }

    const commentsResult = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", params.id)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (commentsResult.error) {
      throw new Error(commentsResult.error.message);
    }

    let comments: CommentSummary[] = [];

    try {
      comments = await toCommentSummaries(
        supabase,
        commentsResult.data ?? [],
        postResult.data.community_id,
        user?.id,
      );
    } catch (commentSummaryError) {
      const commentSummaryErrorForClassification =
        commentSummaryError instanceof Error
          ? commentSummaryError
          : typeof commentSummaryError === 'object' && commentSummaryError !== null
            ? (commentSummaryError as { message?: string; code?: string })
            : undefined;

      if (!isRecoverableSupabaseReadError(commentSummaryErrorForClassification)) {
        throw commentSummaryError;
      }

      if (verboseLogging) {
        logInfo('api-post-detail', 'Recoverable comment enrichment failure, returning empty comments', {
          postId: params.id,
          userId: authUserId,
          error:
            commentSummaryError instanceof Error
              ? commentSummaryError.message
              : 'Unknown recoverable comment enrichment error',
        });
      }
    }

    return ok({ post, comments });
  } catch (error) {
    logError('api-post-detail', 'Post detail route failed', {
      postId: params.id,
      userId: authUserId,
      error: error instanceof Error ? error.message : 'Unknown post detail error',
    });

    return handleApiError(error);
  }
}
