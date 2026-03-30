import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { CreateCommentSchema } from '@/lib/schemas/comment';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendNotification } from '@/lib/supabase/notifications';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { toCommentSummaries } from '@/lib/supabase/query-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
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

    const comments = await toCommentSummaries(
      supabase,
      commentsResult.data ?? [],
      postResult.data.community_id,
    );

    return ok(comments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
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

    const [comment] = await toCommentSummaries(
      supabase,
      [data],
      postResult.data.community_id,
    );

    if (postResult.data.author_id !== user.id) {
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
    }

    return ok(comment);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
