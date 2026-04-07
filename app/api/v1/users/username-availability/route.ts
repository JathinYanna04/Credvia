import { fail, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function normalizeUsername(value: string | null) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = normalizeUsername(searchParams.get('username'));

  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return fail(
      'VALIDATION_ERROR',
      'Use 3 to 30 lowercase letters, numbers, underscores, or hyphens.',
      400,
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileResult, existingResult] = await Promise.all([
    user
      ? supabase.from('profiles').select('user_id, username').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('profiles').select('user_id, username').eq('username', username).maybeSingle(),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (existingResult.error && existingResult.error.code !== 'PGRST116') {
    throw new Error(existingResult.error.message);
  }

  const available =
    !existingResult.data ||
    (user && existingResult.data.user_id === user.id) ||
    profileResult.data?.username === username;

  return ok({
    username,
    available,
  });
}
