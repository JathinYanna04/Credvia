import { fail } from '@/lib/api';
import type { Database } from '@/lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type TypedSupabaseClient = SupabaseClient<Database>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveTargetUserId(
  supabase: TypedSupabaseClient,
  usernameOrId: string,
) {
  if (UUID_PATTERN.test(usernameOrId)) {
    return usernameOrId;
  }

  const profileResult = await supabase
    .from('profiles')
    .select('user_id')
    .eq('username', usernameOrId)
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (!profileResult.data?.user_id) {
    throw fail('NOT_FOUND', 'User not found.', 404);
  }

  return profileResult.data.user_id;
}
