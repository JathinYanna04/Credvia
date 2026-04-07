import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

const TopicFollowSchema = z.object({
  following: z.boolean().default(true),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, TopicFollowSchema);

    if (body.following) {
      const insertResult = await supabase.from('user_topic_follows').upsert({
        user_id: user.id,
        topic_id: id,
      });

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    } else {
      const deleteResult = await supabase
        .from('user_topic_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('topic_id', id);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    }

    return ok({ topicId: id, following: body.following });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
