import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { getPostAuthRedirectPath } from '@/lib/profile-state';
import { normalizePersonaSlug } from '@/lib/personas';
import { LoginSchema } from '@/lib/schemas/auth';
import { ensureProfileRecord, isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

type RedirectProfile = {
  onboarding_complete: boolean;
  primary_persona: string | null;
  username: string;
  full_name: string | null;
};

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
    const inferredAccountType = normalizePersonaSlug(user.user_metadata?.account_type) ?? 'professional';

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
          account_type: inferredAccountType,
          status: 'active',
        })
        .select('id')
        .single();

      if (publicUserResult.error) {
        if (!isRecoverableSupabaseReadError(publicUserResult.error)) {
          throw publicUserResult.error;
        }
      }
    }

    let profile: RedirectProfile;
    try {
      const ensuredProfile = await ensureProfileRecord(supabase, user);
      profile = {
        onboarding_complete: ensuredProfile.onboarding_complete,
        primary_persona: ensuredProfile.primary_persona,
        username: ensuredProfile.username,
        full_name: ensuredProfile.full_name,
      };
    } catch (profileError) {
      const profileErrorForClassification =
        profileError instanceof Error
          ? profileError
          : typeof profileError === 'object' && profileError !== null
            ? (profileError as { message?: string; code?: string })
            : undefined;

      if (!isRecoverableSupabaseReadError(profileErrorForClassification)) {
        throw profileError;
      }

      const emailBase = user.email?.split('@')[0] ?? `user-${user.id.slice(0, 8)}`;
      profile = {
        onboarding_complete: false,
        username: emailBase.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30),
        full_name:
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : null,
        primary_persona: inferredAccountType,
      };
    }

    return ok({
      id: user.id,
      redirectTo: getPostAuthRedirectPath(profile),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
