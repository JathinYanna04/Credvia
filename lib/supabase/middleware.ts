import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { getRequiredSupabaseBrowserConfig } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';
import { isSchemaCompatibilityError } from '@/lib/supabase/helpers';

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const config = getRequiredSupabaseBrowserConfig();

  const supabase = createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    response.cookies.set('sb-user-id', user.id, {
      httpOnly: false,
      path: '/',
    });
  } else {
    response.cookies.delete('sb-user-id');
  }

  let profile: Pick<
    Database['public']['Tables']['profiles']['Row'],
    | 'primary_persona'
    | 'onboarding_complete'
    | 'onboarding_version'
    | 'persona_completion_score'
    | 'username'
    | 'full_name'
  > | null = null;

  if (user) {
    const profileResult = await supabase
      .from('profiles')
      .select('primary_persona, onboarding_complete, onboarding_version, persona_completion_score, username, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileResult.error && isSchemaCompatibilityError(profileResult.error)) {
      const fallbackProfileResult = await supabase
          .from('profiles')
        .select('onboarding_complete, username, full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const accountTypeResult = await supabase
        .from('users')
        .select('account_type')
        .eq('id', user.id)
        .maybeSingle();

      profile = fallbackProfileResult.data
        ? {
            onboarding_complete: Boolean(fallbackProfileResult.data.onboarding_complete),
            primary_persona:
              typeof accountTypeResult.data?.account_type === 'string'
                ? accountTypeResult.data.account_type
                : null,
            onboarding_version: 1,
            persona_completion_score: 0,
            username:
              typeof fallbackProfileResult.data.username === 'string'
                ? fallbackProfileResult.data.username
                : '',
            full_name:
              typeof fallbackProfileResult.data.full_name === 'string'
                ? fallbackProfileResult.data.full_name
                : null,
          }
        : null;
    } else {
      profile = profileResult.data ?? null;
    }
  }

  return {
    response,
    user: user as User | null,
    profile,
  };
}
