import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { getRequiredSupabaseBrowserConfig } from '@/lib/supabase/env';

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

  return {
    response,
    user: user as User | null,
  };
}
