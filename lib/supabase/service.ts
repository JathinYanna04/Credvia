import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';

function logSupabaseServiceInfo(message: string, meta?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    level: 'info',
    scope: 'supabase-service-client',
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  }));
}

function logSupabaseServiceError(message: string, meta?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    level: 'error',
    scope: 'supabase-service-client',
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  }));
}

export function createServiceRoleClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = getSupabaseUrl();

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here' || !url) {
    logSupabaseServiceError('Service role client initialization failed', {
      hasSupabaseUrl: Boolean(url),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      serviceRoleLooksPlaceholder: serviceRoleKey === 'your-service-role-key-here',
    });
    return null;
  }

  logSupabaseServiceInfo('Service role client initialized', {
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
