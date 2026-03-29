import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { CreateReportSchema } from '@/lib/schemas/report';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, CreateReportSchema);
    const limit = await enforceRateLimit('report', user.id);
    const serviceClient = createServiceRoleClient();

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many reports submitted. Try again later.', 429);
    }

    if (!serviceClient) {
      throw new Error('Missing service role client for reports.');
    }

    if (body.target_type === 'post') {
      const postResult = await supabase
        .from('posts')
        .select('id')
        .eq('id', body.target_id)
        .eq('status', 'published')
        .maybeSingle();

      if (postResult.error) {
        throw new Error(postResult.error.message);
      }

      if (!postResult.data) {
        return fail('NOT_FOUND', 'Post not found.', 404);
      }
    }

    if (body.target_type === 'comment') {
      const commentResult = await supabase
        .from('comments')
        .select('id')
        .eq('id', body.target_id)
        .eq('status', 'published')
        .maybeSingle();

      if (commentResult.error) {
        throw new Error(commentResult.error.message);
      }

      if (!commentResult.data) {
        return fail('NOT_FOUND', 'Comment not found.', 404);
      }
    }

    if (body.target_type === 'profile') {
      const profileResult = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', body.target_id)
        .maybeSingle();

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (!profileResult.data) {
        return fail('NOT_FOUND', 'Profile not found.', 404);
      }
    }

    const insertResult = await serviceClient
      .from('reports')
      .insert({
        reporter_user_id: user.id,
        target_type: body.target_type,
        target_id: body.target_id,
        reason_code: body.reason_code,
        details: body.details ?? null,
      })
      .select('id, status, reason_code, target_type, target_id, details')
      .single();

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    return ok(insertResult.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
