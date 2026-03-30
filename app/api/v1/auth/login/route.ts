import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { LoginSchema } from '@/lib/schemas/auth';
import { ensureProfileRecord } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const values = await parseJson(request, LoginSchema);
    const supabase = await createServerSupabaseClient();

    const signInResult = await supabase.auth.signInWithPassword(values);

    if (signInResult.error || !signInResult.data.user) {
      return fail(
        'UNAUTHORIZED',
        signInResult.error?.message ?? 'Invalid email or password.',
        401,
      );
    }

    const user = signInResult.data.user;
    const serviceRoleClient = createServiceRoleClient();

    if (serviceRoleClient) {
      const publicUserResult = await serviceRoleClient
        .from('users')
        .upsert({
          id: user.id,
          email: user.email ?? '',
          auth_provider:
            typeof user.app_metadata?.provider === 'string'
              ? user.app_metadata.provider
              : 'email',
          account_type:
            typeof user.user_metadata?.account_type === 'string'
              ? user.user_metadata.account_type
              : 'professional',
          status: 'active',
        })
        .select('id')
        .single();

      if (publicUserResult.error) {
        throw publicUserResult.error;
      }
    }

    const profile = await ensureProfileRecord(supabase, user);

    return ok({
      id: user.id,
      redirectTo: profile.onboarding_complete ? '/feed' : '/onboarding/interests',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
