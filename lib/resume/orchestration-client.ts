import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/types';
import { toResumePersistenceError } from '@/lib/resume/persistence-error';

interface ResolveResumeOrchestrationClientArgs {
  resumeId?: string;
}

export function resolveResumeOrchestrationClient({
  resumeId,
}: ResolveResumeOrchestrationClientArgs): SupabaseClient<Database> {
  const serviceRoleClient = createServiceRoleClient();

  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  throw toResumePersistenceError(
    'Resume orchestration service is unavailable.',
    {
      operation: 'resolve-orchestration-client',
      table: 'resume_analysis_runs',
      resumeId,
    },
    {
      message: 'SUPABASE_SERVICE_ROLE_KEY is missing in production runtime.',
      code: 'CONFIG_MISSING',
      details: null,
      hint: 'Set SUPABASE_SERVICE_ROLE_KEY for server-side orchestration writes.',
    },
  );
}
