import { fail, handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toCommentSummaries, toPostSummaries } from '@/lib/supabase/query-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const postResult = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .eq('post_type', 'startup_idea')
      .eq('status', 'published')
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail('NOT_FOUND', 'Startup idea not found.', 404);
    }

    const [idea] = await toPostSummaries(supabase, [postResult.data]);

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

    return ok({ idea, comments });
  } catch (error) {
    return handleApiError(error);
  }
}
