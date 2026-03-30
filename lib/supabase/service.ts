import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';

export function createServiceRoleClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = getSupabaseUrl();

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here' || !url) {
    return null;
  }

  return createClient<Database>(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  ) as SupabaseClient<Database>;
}
