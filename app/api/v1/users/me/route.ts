import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser } from '@/lib/supabase/helpers';
import { UpdateProfileSchema } from '@/lib/schemas/profile';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const profile = await ensureProfileRecord(supabase, user);

    return ok({
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      profile,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, UpdateProfileSchema);

    await ensureProfileRecord(supabase, user);

    const { data, error } = await supabase
      .from('profiles')
      .update(body)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return ok(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
