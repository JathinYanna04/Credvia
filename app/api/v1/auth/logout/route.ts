import { fail, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await getRequiredUser(supabase);
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    return ok({ signedOut: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return fail('INTERNAL_ERROR', 'Could not sign out.', 500);
  }
}
