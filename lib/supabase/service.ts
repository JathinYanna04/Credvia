import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';

export function createServiceRoleClient() {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = getSupabaseUrl();

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here' || !url) {
    return null;
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
