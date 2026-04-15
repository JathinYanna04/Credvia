import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';
import { logError, logInfo } from '@/lib/utils/logger';

export function createServiceRoleClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = getSupabaseUrl();

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here' || !url) {
    logError('supabase-service-client', 'Service role client initialization failed', {
      hasSupabaseUrl: Boolean(url),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      serviceRoleLooksPlaceholder: serviceRoleKey === 'your-service-role-key-here',
    });
    return null;
  }

  logInfo('supabase-service-client', 'Service role client initialized', {
    hasSupabaseUrl: true,
    hasServiceRoleKey: true,
  });

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
