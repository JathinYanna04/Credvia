import { fail, handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);

    const [topicsResult, followsResult] = await Promise.all([
      supabase.from('topics').select('id, slug, label, description').order('label', { ascending: true }),
      supabase.from('user_topic_follows').select('topic_id').eq('user_id', user.id),
    ]);

    if (topicsResult.error) {
      throw new Error(topicsResult.error.message);
    }

    if (followsResult.error) {
      throw new Error(followsResult.error.message);
    }

    return ok({
      topics: topicsResult.data ?? [],
      followedTopicIds: (followsResult.data ?? []).map((item) => item.topic_id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
