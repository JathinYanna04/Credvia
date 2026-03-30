import { fail, handleApiError, ok } from '@/lib/api';
import { getJobCardsByIds } from '@/lib/career-match/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const [job] = await getJobCardsByIds(supabase, [params.id]);

    if (!job || !job.is_active) {
      return fail('NOT_FOUND', 'Job not found.', 404);
    }

    return ok(job);
  } catch (error) {
    return handleApiError(error);
  }
}
