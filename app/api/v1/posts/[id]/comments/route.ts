import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { CreateCommentSchema } from '@/lib/schemas/comment';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendNotification } from '@/lib/supabase/notifications';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser, isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import { toCommentSummaries } from '@/lib/supabase/query-helpers';
import type { CommentSummary } from '@/lib/types';
import { buildServerVersion } from '@/lib/voting';
import { logError, logInfo } from '@/lib/utils/logger';

const verboseLogging = process.env.NODE_ENV !== 'production';

function toFallbackCommentSummary(
  user: { id: string; user_metadata?: Record<string, unknown> },
  row: Record<string, unknown>,
): CommentSummary {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt;

  return {
    id: typeof row.id === 'string' ? row.id : '',
    author: {
      id: user.id,
      username: `user_${user.id.slice(0, 8)}`,
      fullName:
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : 'Credvia User',
      headline: '',
      avatarUrl: '',
      skills: [],
      reputation: [],
    },
    body: typeof row.body_md === 'string' ? row.body_md : '',
    createdAt,
    updatedAt,
    version: buildServerVersion(updatedAt),
    voteScore: typeof row.vote_score === 'number' ? row.vote_score : 0,
    upvoteCount: 0,
    downvoteCount: 0,
    currentUserVote: 0,
    isBestAnswer: row.is_best_answer === true,
    replies: [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authUserId = user?.id ?? null;
    const postResult = await supabase
      .from('posts')
      .select('community_id')
      .eq('id', params.id)
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail('NOT_FOUND', 'Post not found.', 404);
    }

    const commentsResult = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', params.id)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

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
        logInfo('api-post-comments', 'Recoverable comment enrichment failure, returning empty list', {
          postId: params.id,
          userId: authUserId,
          error:
            commentSummaryError instanceof Error
              ? commentSummaryError.message
              : 'Unknown recoverable comment enrichment error',
        });
      }
    }

    return ok(comments);
  } catch (error) {
    logError('api-post-comments', 'Post comments GET failed', {
      postId: params.id,
      userId: authUserId,
      error: error instanceof Error ? error.message : 'Unknown post comments GET error',
    });

    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    authUserId = user.id;
    const body = await parseJson(request, CreateCommentSchema);

    if (body.post_id !== params.id) {
      return fail('VALIDATION_ERROR', 'Post id mismatch.', 400);
    }

    const limit = await enforceRateLimit('comment_create', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many comments created. Try again soon.', 429);
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: params.id,
        author_id: user.id,
        parent_comment_id: body.parent_comment_id ?? null,
        body_md: body.body_md,
        body_html: sanitizeHtml(body.body_md),
        status: 'published',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const postResult = await supabase
      .from('posts')
      .select('community_id, author_id, title')
      .eq('id', params.id)
      .single();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    let comment: CommentSummary | undefined;

    try {
      [comment] = await toCommentSummaries(
        supabase,
        [data],
        postResult.data.community_id,
        user.id,
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
        logInfo('api-post-comments', 'Recoverable comment enrichment failure after insert, using fallback comment payload', {
          postId: params.id,
          userId: user.id,
          commentId: data.id,
          error:
            commentSummaryError instanceof Error
              ? commentSummaryError.message
              : 'Unknown recoverable comment enrichment error',
        });
      }

      comment = toFallbackCommentSummary(user, data as Record<string, unknown>);
    }

    if (!comment) {
      comment = toFallbackCommentSummary(user, data as Record<string, unknown>);
    }

    if (postResult.data.author_id !== user.id) {
      try {
        await sendNotification({
          userId: postResult.data.author_id,
          notifType: 'reply',
          actorUserId: user.id,
          entityType: 'post',
          entityId: params.id,
          payload: {
            title: postResult.data.title,
            commentId: data.id,
          },
        });
      } catch (notificationError) {
        if (verboseLogging) {
          logInfo('api-post-comments', 'Recoverable notification failure after comment insert', {
            postId: params.id,
            userId: user.id,
            commentId: data.id,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : 'Unknown notification failure',
          });
        }
      }
    }

    return ok(comment);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    logError('api-post-comments', 'Post comments POST failed', {
      postId: params.id,
      userId: authUserId,
      error: error instanceof Error ? error.message : 'Unknown post comments POST error',
    });

    return handleApiError(error);
  }
}
