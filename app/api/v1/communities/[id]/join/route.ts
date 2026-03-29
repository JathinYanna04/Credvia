import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { JoinCommunitySchema } from '@/lib/schemas/community';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, JoinCommunitySchema);

    const communityId = params.id;

    if (communityId !== body.communityId) {
      return fail('VALIDATION_ERROR', 'Community id mismatch.', 400);
    }

    if (body.joined) {
      const { error } = await supabase.from('community_memberships').insert({
        user_id: user.id,
        community_id: communityId,
        role: 'member',
      });

      if (error && error.code !== '23505') {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from('community_memberships')
        .delete()
        .eq('user_id', user.id)
        .eq('community_id', communityId);

      if (error) {
        throw new Error(error.message);
      }
    }

    return ok({ joined: body.joined, communityId });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
