import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { getRequiredSupabaseBrowserConfig } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';

export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = cookies();
  const config = getRequiredSupabaseBrowserConfig();

  return createServerClient<Database>(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
