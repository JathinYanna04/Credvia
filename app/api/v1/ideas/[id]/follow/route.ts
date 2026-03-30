import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { FollowIdeaSchema } from '@/lib/schemas/post';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendNotification } from '@/lib/supabase/notifications';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, FollowIdeaSchema);
    const limit = await enforceRateLimit('idea_follow', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many follow changes. Try again shortly.', 429);
    }

    const postResult = await supabase
      .from('posts')
      .select('id, author_id, title, post_type, status')
      .eq('id', params.id)
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data || postResult.data.post_type !== 'startup_idea' || postResult.data.status !== 'published') {
      return fail('NOT_FOUND', 'Startup idea not found.', 404);
    }

    if (body.following) {
      const insertResult = await supabase.from('idea_followers').upsert({
        post_id: params.id,
        user_id: user.id,
      });

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    } else {
      const deleteResult = await supabase
        .from('idea_followers')
        .delete()
        .eq('post_id', params.id)
        .eq('user_id', user.id);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    }

    const countResult = await supabase
      .from('idea_followers')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', params.id);

    if (countResult.error) {
      throw new Error(countResult.error.message);
    }

    const followerCount = countResult.count ?? 0;
    const updateResult = await supabase
      .from('startup_ideas')
      .update({ follower_count: followerCount })
      .eq('post_id', params.id);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    if (body.following && postResult.data.author_id !== user.id) {
      await sendNotification({
        userId: postResult.data.author_id,
        notifType: 'follow',
        actorUserId: user.id,
        entityType: 'post',
        entityId: params.id,
        payload: { title: postResult.data.title },
      });
    }

    return ok({ following: body.following, followerCount });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
