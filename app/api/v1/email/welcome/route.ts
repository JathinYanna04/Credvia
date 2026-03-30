import { fail, handleApiError, ok } from '@/lib/api';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);

    if (!user.email) {
      return fail('VALIDATION_ERROR', 'No email is available for this user.', 400);
    }

    const profileResult = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    const result = await sendWelcomeEmail({
      to: user.email,
      name:
        profileResult.data?.full_name ??
        (typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : null),
    });

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
