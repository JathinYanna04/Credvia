import { handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase
      .from('communities')
      .select('id, name, slug, description, member_count, post_count')
      .eq('status', 'active')
      .order('member_count', { ascending: false });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return ok(result.data ?? []);
  } catch (error) {
    return handleApiError(error);
  }
}
