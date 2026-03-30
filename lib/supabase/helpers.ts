import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { slugify } from '@/lib/utils/format';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type SupabaseClientLike = SupabaseClient<Database>;

export async function getRequiredUser(supabase: SupabaseClientLike) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('UNAUTHORIZED');
  }

  return user;
}

function buildProfileUsername(user: User) {
  const emailBase = user.email?.split('@')[0] ?? `user-${user.id.slice(0, 8)}`;
  const cleanBase = slugify(emailBase).replace(/-/g, '_').slice(0, 20) || 'builder';
  const suffix = user.id.replace(/-/g, '').slice(0, 8);
  return `${cleanBase}_${suffix}`.slice(0, 30);
}

export async function ensureProfileRecord(supabase: SupabaseClientLike, user: User) {
  const existingProfileResult = await supabase
    .from('profiles')
    .select('user_id, username, onboarding_complete, full_name, headline, bio, avatar_url, location, current_company, education, profile_visibility, created_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingProfileResult.data) {
    return existingProfileResult.data as ProfileRow;
  }

  const profileInsert = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      username: buildProfileUsername(user),
      full_name:
        (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
        null,
      onboarding_complete: false,
    })
    .select('user_id, username, onboarding_complete, full_name, headline, bio, avatar_url, location, current_company, education, profile_visibility, created_at, updated_at')
    .single();

  if (profileInsert.error) {
    throw new Error(profileInsert.error.message);
  }

  return profileInsert.data as ProfileRow;
}
