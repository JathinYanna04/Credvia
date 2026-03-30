import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { StartupSourceSyncSchema } from '@/lib/schemas/career-match';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { syncYcJobs } from '@/lib/jobs/sync';

async function hasSyncAccess(request: Request) {
  const secret = process.env.CAREER_MATCH_SYNC_SECRET;
  const provided = request.headers.get('x-sync-secret');

  if (secret && provided === secret) {
    return true;
  }

  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);
  const membership = await supabase
    .from('community_memberships')
    .select('community_id')
    .eq('user_id', user.id)
    .in('role', ['moderator', 'admin'])
    .limit(1);

  if (membership.error) {
    throw new Error(membership.error.message);
  }

  return (membership.data ?? []).length > 0;
}

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, StartupSourceSyncSchema);
    const allowed = await hasSyncAccess(request);
    if (!allowed) {
      return fail('FORBIDDEN', 'Startup source sync requires internal access.', 403);
    }

    const limit = await enforceRateLimit('startup_source_sync', request.headers.get('x-forwarded-for') ?? 'internal-sync');
    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many sync attempts. Try again shortly.', 429);
    }

    const serviceClient = createServiceRoleClient();
    if (!serviceClient) {
      return fail('INTERNAL_ERROR', 'Service role client is not configured.', 500);
    }

    if (body.source && body.source !== 'yc' && body.source !== 'all') {
      return fail('VALIDATION_ERROR', 'Only YC sync is enabled in V1.', 400);
    }

    const result = await syncYcJobs(serviceClient, { dryRun: body.dryRun ?? false });
    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
