import { handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStartupIdeaBundle } from '@/lib/supabase/startup-ideas';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const bundle = await getStartupIdeaBundle(supabase, params.id, user?.id);

    if (bundle instanceof Response) {
      return bundle;
    }

    return ok(bundle);
  } catch (error) {
    return handleApiError(error);
  }
}
