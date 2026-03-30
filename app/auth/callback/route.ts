import { NextResponse } from 'next/server';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getSupabaseEnvDebug } from '@/lib/supabase/env';
import { ensureProfileRecord } from '@/lib/supabase/helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError, logInfo } from '@/lib/utils/logger';

function redirectWithError(origin: string, message: string) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, origin),
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');
  const requestId = crypto.randomUUID();
  const envDebug = getSupabaseEnvDebug();

  logInfo('auth-callback', 'Callback hit', {
    requestId,
    hasCode: Boolean(code),
    oauthError,
    oauthErrorDescription,
    envDebug,
  });

  if (oauthError) {
    const oauthMessage = oauthErrorDescription
      ? `${oauthError}: ${oauthErrorDescription}`
      : oauthError;
    logError('auth-callback', 'OAuth provider returned an error before session exchange', {
      requestId,
      oauthMessage,
    });
    return redirectWithError(origin, oauthMessage);
  }

  if (!code) {
    logError('auth-callback', 'Missing code in callback request', { requestId });
    return redirectWithError(origin, 'Missing OAuth code in callback.');
  }

  let supabase;

  try {
    supabase = await createServerSupabaseClient();
    logInfo('auth-callback', 'Initialized server Supabase client for callback exchange', {
      requestId,
      helper: 'createServerSupabaseClient',
      keySource: envDebug.resolvedPublishableKeySource,
      keyPrefix: envDebug.resolvedPublishableKeyPrefix,
    });
  } catch (clientError) {
    const message =
      clientError instanceof Error
        ? clientError.message
        : 'Supabase callback client initialization failed.';

    logError('auth-callback', 'Failed to initialize Supabase callback client', {
      requestId,
      message,
      envDebug,
    });

    return redirectWithError(origin, message);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  logInfo('auth-callback', 'exchangeCodeForSession finished', {
    requestId,
    exchangeError: error?.message ?? null,
    exchangeErrorSource: 'supabase.auth.exchangeCodeForSession',
    hasSession: Boolean(data.session),
    userId: data.user?.id ?? null,
    userEmail: data.user?.email ?? null,
    provider: data.user?.app_metadata?.provider ?? null,
    keySource: envDebug.resolvedPublishableKeySource,
    keyPrefix: envDebug.resolvedPublishableKeyPrefix,
  });

  if (error || !data.user) {
    const message = error?.message ?? 'Session exchange did not return a user.';
    await captureServerEvent({
      event: 'oauth_google_failed',
      distinctId: data.user?.id ?? null,
      properties: {
        stage: 'exchange',
        message,
      },
    });
    logError('auth-callback', 'Session exchange failed', {
      requestId,
      message,
    });
    return redirectWithError(origin, message);
  }

  const serviceRoleClient = createServiceRoleClient();

  if (serviceRoleClient) {
    const [adminUserResult, publicUserResult, profileResult] = await Promise.all([
      serviceRoleClient.auth.admin.getUserById(data.user.id),
      serviceRoleClient.from('users').select('id, email').eq('id', data.user.id).maybeSingle(),
      serviceRoleClient
        .from('profiles')
        .select('user_id, username, onboarding_complete')
        .eq('user_id', data.user.id)
        .maybeSingle(),
    ]);

    logInfo('auth-callback', 'Post-exchange user bootstrap inspection', {
      requestId,
      authUserExists: Boolean(adminUserResult.data.user),
      authUserError: adminUserResult.error?.message ?? null,
      publicUserExists: Boolean(publicUserResult.data),
      publicUserError: publicUserResult.error?.message ?? null,
      profileExistsBeforeEnsure: Boolean(profileResult.data),
      profileErrorBeforeEnsure: profileResult.error?.message ?? null,
      bootstrapMigrationWorked: Boolean(publicUserResult.data && profileResult.data),
    });
  } else {
    logError('auth-callback', 'Service role client unavailable; cannot inspect auth.users/public.users/profiles', {
      requestId,
    });
  }

  let profile;

  try {
    profile = await ensureProfileRecord(supabase, data.user);
    logInfo('auth-callback', 'ensureProfileRecord succeeded', {
      requestId,
      userId: data.user.id,
      username: profile.username,
      onboardingComplete: profile.onboarding_complete,
    });
  } catch (profileError) {
    const message =
      profileError instanceof Error
        ? profileError.message
        : 'Unknown profile bootstrap failure.';

    await captureServerEvent({
      event: 'oauth_google_failed',
      distinctId: data.user.id,
      properties: {
        stage: 'profile_bootstrap',
        message,
      },
    });

    logError('auth-callback', 'Profile bootstrap failed after session exchange', {
      requestId,
      userId: data.user.id,
      message,
    });

    if (serviceRoleClient) {
      const [publicUserResult, profileResult] = await Promise.all([
        serviceRoleClient.from('users').select('id, email').eq('id', data.user.id).maybeSingle(),
        serviceRoleClient
          .from('profiles')
          .select('user_id, username, onboarding_complete')
          .eq('user_id', data.user.id)
          .maybeSingle(),
      ]);

      logError('auth-callback', 'Bootstrap state after ensureProfileRecord failure', {
        requestId,
        publicUserExists: Boolean(publicUserResult.data),
        publicUserError: publicUserResult.error?.message ?? null,
        profileExists: Boolean(profileResult.data),
        profileError: profileResult.error?.message ?? null,
      });
    }

    return redirectWithError(origin, message);
  }

  const redirectPath = profile.onboarding_complete ? '/feed' : '/onboarding/interests';
  await captureServerEvent({
    event: 'oauth_google_completed',
    distinctId: data.user.id,
    properties: {
      provider: 'google',
      redirectPath,
      onboardingComplete: profile.onboarding_complete,
    },
  });
  logInfo('auth-callback', 'Callback completed successfully', {
    requestId,
    redirectPath,
    userId: data.user.id,
  });

  return NextResponse.redirect(new URL(redirectPath, origin));
}
