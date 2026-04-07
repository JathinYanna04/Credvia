import { fail, handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { resolveTargetUserId } from '../_resolve-user';

export async function POST(
  _request: Request,
  { params }: { params: { username: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const targetUserId = await resolveTargetUserId(supabase, params.username);

    const result = await supabase.from('follows').upsert({
      follower_id: user.id,
      followed_id: targetUserId,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return ok({ userId: targetUserId, following: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Response) {
      return error;
    }

    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { username: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const targetUserId = await resolveTargetUserId(supabase, params.username);

    const result = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followed_id', targetUserId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return ok({ userId: targetUserId, following: false });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Response) {
      return error;
    }

    return handleApiError(error);
  }
}
