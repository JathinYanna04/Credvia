import { ok, handleApiError } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('communities')
      .select('id, name, slug, description, member_count, post_count')
      .eq('status', 'active')
      .order('member_count', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return ok(data ?? []);
  } catch (error) {
    return handleApiError(error);
  }
}
