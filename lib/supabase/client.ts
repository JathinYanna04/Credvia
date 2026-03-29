import { createBrowserClient } from '@supabase/ssr';
import { getRequiredSupabaseBrowserConfig } from '@/lib/supabase/env';

export function createClient() {
  const config = getRequiredSupabaseBrowserConfig();

  return createBrowserClient(
    config.url,
    config.key,
  );
}
