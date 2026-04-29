import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { inferPersonaFromUser, PROFILE_SELECT } from '@/lib/profile-state';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { slugify } from '@/lib/utils/format';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type SupabaseClientLike = SupabaseClient<Database>;
const LEGACY_PROFILE_SELECT =
  'user_id, username, full_name, headline, bio, avatar_url, location, current_company, education, profile_visibility, onboarding_complete, onboarding_completed_at, created_at, updated_at';

const AUTH_TRANSPORT_ERROR_PATTERNS = [
  'und_err_connect_timeout',
  'und_err_socket',
  'econnreset',
  'etimedout',
  'socket',
  'network',
  'fetch failed',
  'connection closed',
  'timeout',
];

export interface GetRequiredUserOptions {
  timeoutMs?: number;
  retries?: number;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    return typeof value === 'string' ? value : '';
  }

  return '';
}

export function isSupabaseAuthTransportError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return AUTH_TRANSPORT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function resolveSupabaseUserWithTimeout(
  supabase: SupabaseClientLike,
  timeoutMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const authPromise = supabase.auth.getUser();
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('AUTH_SESSION_TIMEOUT'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([authPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function isSchemaCompatibilityError(error: { message?: string } | Error | null | undefined) {
  const message = error instanceof Error ? error.message : error?.message ?? '';
  return (
    message.includes('schema cache') ||
    message.includes('Could not find the') ||
    message.includes('does not exist') ||
    message.includes('column') ||
    message.includes('relation')
  );
}

export function isSupabasePermissionError(
  error: { message?: string; code?: string } | Error | null | undefined,
) {
  const message =
    (error instanceof Error ? error.message : error?.message ?? '').toLowerCase();
  const code = error instanceof Error ? undefined : error?.code;

  return (
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('not allowed')
  );
}

export function isRecoverableSupabaseReadError(
  error: { message?: string; code?: string } | Error | null | undefined,
) {
  return isSchemaCompatibilityError(error) || isSupabasePermissionError(error);
}

async function ensurePublicUserRecord(user: User) {
  const serviceClient = createServiceRoleClient();

  if (!serviceClient) {
    return;
  }

  await serviceClient
    .from('users')
    .upsert(
      {
        id: user.id,
        email: user.email ?? `${user.id}@unknown.local`,
        auth_provider:
          typeof user.app_metadata?.provider === 'string'
            ? user.app_metadata.provider
            : 'email',
        account_type: inferPersonaFromUser(user),
        status: 'active',
      },
      {
        onConflict: 'id',
      },
    );
}

function normalizeProfileRow(
  row: Record<string, unknown>,
  fallbackPersona: string | null,
): ProfileRow {
  return {
    user_id: String(row.user_id),
    username: String(row.username ?? ''),
    full_name: typeof row.full_name === 'string' ? row.full_name : null,
    headline: typeof row.headline === 'string' ? row.headline : null,
    bio: typeof row.bio === 'string' ? row.bio : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    location: typeof row.location === 'string' ? row.location : null,
    website: typeof row.website === 'string' ? row.website : null,
    current_company: typeof row.current_company === 'string' ? row.current_company : null,
    education: typeof row.education === 'string' ? row.education : null,
    primary_persona:
      typeof row.primary_persona === 'string' ? row.primary_persona : fallbackPersona,
    secondary_personas: Array.isArray(row.secondary_personas) ? (row.secondary_personas as string[]) : [],
    profile_intent: Array.isArray(row.profile_intent) ? (row.profile_intent as string[]) : [],
    open_to: Array.isArray(row.open_to) ? (row.open_to as string[]) : [],
    expertise_tags: Array.isArray(row.expertise_tags) ? (row.expertise_tags as string[]) : [],
    interest_tags: Array.isArray(row.interest_tags) ? (row.interest_tags as string[]) : [],
    contribution_score: typeof row.contribution_score === 'number' ? row.contribution_score : 0,
    credibility_score: typeof row.credibility_score === 'number' ? row.credibility_score : 0,
    helpfulness_score: typeof row.helpfulness_score === 'number' ? row.helpfulness_score : 0,
    expertise_score: typeof row.expertise_score === 'number' ? row.expertise_score : 0,
    community_score: typeof row.community_score === 'number' ? row.community_score : 0,
    persona_completion_score:
      typeof row.persona_completion_score === 'number' ? row.persona_completion_score : 0,
    open_for_opportunities:
      typeof row.open_for_opportunities === 'boolean' ? row.open_for_opportunities : false,
    open_for_mentorship:
      typeof row.open_for_mentorship === 'boolean' ? row.open_for_mentorship : false,
    open_for_hiring: typeof row.open_for_hiring === 'boolean' ? row.open_for_hiring : false,
    onboarding_version: typeof row.onboarding_version === 'number' ? row.onboarding_version : 1,
    contribution_profile:
      row.contribution_profile && typeof row.contribution_profile === 'object'
        ? (row.contribution_profile as Database['public']['Tables']['profiles']['Row']['contribution_profile'])
        : {},
    trust_profile:
      row.trust_profile && typeof row.trust_profile === 'object'
        ? (row.trust_profile as Database['public']['Tables']['profiles']['Row']['trust_profile'])
        : {},
    behavioral_signals:
      row.behavioral_signals && typeof row.behavioral_signals === 'object'
        ? (row.behavioral_signals as Database['public']['Tables']['profiles']['Row']['behavioral_signals'])
        : {},
    growth_trajectory:
      row.growth_trajectory && typeof row.growth_trajectory === 'object'
        ? (row.growth_trajectory as Database['public']['Tables']['profiles']['Row']['growth_trajectory'])
        : {},
    identity_confidence_score:
      typeof row.identity_confidence_score === 'number' ? row.identity_confidence_score : 0,
    consistency_score: typeof row.consistency_score === 'number' ? row.consistency_score : 0,
    depth_score: typeof row.depth_score === 'number' ? row.depth_score : 0,
    impact_score: typeof row.impact_score === 'number' ? row.impact_score : 0,
    signal_to_noise_ratio:
      typeof row.signal_to_noise_ratio === 'number' ? row.signal_to_noise_ratio : 0,
    domain_authority_score:
      typeof row.domain_authority_score === 'number' ? row.domain_authority_score : 0,
    metadata: row.metadata && typeof row.metadata === 'object' ? (row.metadata as ProfileRow['metadata']) : {},
    profile_visibility:
      row.profile_visibility && typeof row.profile_visibility === 'object'
        ? (row.profile_visibility as ProfileRow['profile_visibility'])
        : {},
    onboarding_complete: Boolean(row.onboarding_complete),
    onboarding_completed_at:
      typeof row.onboarding_completed_at === 'string' ? row.onboarding_completed_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

async function getFallbackPersona(supabase: SupabaseClientLike, user: User) {
  const publicUserResult = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .maybeSingle();

  if (!publicUserResult.error && typeof publicUserResult.data?.account_type === 'string') {
    return publicUserResult.data.account_type;
  }

  return inferPersonaFromUser(user);
}

async function selectProfileRecord(supabase: SupabaseClientLike, user: User) {
  const primaryResult = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  if (primaryResult.data) {
    return primaryResult.data as ProfileRow;
  }

  if (primaryResult.error && isSchemaCompatibilityError(primaryResult.error)) {
    const fallbackPersona = await getFallbackPersona(supabase, user);
    const legacyResult = await supabase
      .from('profiles')
      .select(LEGACY_PROFILE_SELECT)
      .eq('user_id', user.id)
      .maybeSingle();

    if (legacyResult.error) {
      throw new Error(legacyResult.error.message);
    }

    if (legacyResult.data) {
      return normalizeProfileRow(legacyResult.data as Record<string, unknown>, fallbackPersona);
    }
  }

  if (primaryResult.error && primaryResult.error.code !== 'PGRST116') {
    throw new Error(primaryResult.error.message);
  }

  return null;
}

export async function getRequiredUser(
  supabase: SupabaseClientLike,
  options: GetRequiredUserOptions = {},
) {
  const timeoutMs = Math.max(250, options.timeoutMs ?? 3000);
  const retries = Math.max(0, options.retries ?? 1);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await resolveSupabaseUserWithTimeout(supabase, timeoutMs);
      const {
        data: { user },
        error,
      } = result;

      if (error) {
        if (isSupabaseAuthTransportError(error) && attempt < retries) {
          continue;
        }

        if (isSupabaseAuthTransportError(error)) {
          throw new Error('AUTH_SESSION_UNAVAILABLE');
        }

        throw new Error('UNAUTHORIZED');
      }

      if (!user) {
        throw new Error('UNAUTHORIZED');
      }

      return user;
    } catch (error) {
      const message = errorMessage(error);
      const isTimeout = message === 'AUTH_SESSION_TIMEOUT';
      const isTransportFailure = isTimeout || isSupabaseAuthTransportError(error);

      if (isTransportFailure && attempt < retries) {
        continue;
      }

      if (isTransportFailure) {
        throw new Error('AUTH_SESSION_UNAVAILABLE');
      }

      if (message === 'UNAUTHORIZED') {
        throw new Error('UNAUTHORIZED');
      }

      throw error instanceof Error ? error : new Error('UNAUTHORIZED');
    }
  }

  throw new Error('AUTH_SESSION_UNAVAILABLE');
}

function buildProfileUsername(user: User) {
  const emailBase = user.email?.split('@')[0] ?? `user-${user.id.slice(0, 8)}`;
  const cleanBase = slugify(emailBase).replace(/-/g, '_').slice(0, 20) || 'builder';
  const suffix = user.id.replace(/-/g, '').slice(0, 8);
  return `${cleanBase}_${suffix}`.slice(0, 30);
}

export async function ensureProfileRecord(supabase: SupabaseClientLike, user: User) {
  const existingProfile = await selectProfileRecord(supabase, user);

  if (existingProfile) {
    return existingProfile;
  }

  await ensurePublicUserRecord(user);

  const initialInsertPayload = {
    user_id: user.id,
    username: buildProfileUsername(user),
    full_name:
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) || null,
    primary_persona: inferPersonaFromUser(user),
    onboarding_complete: false,
  };

  const profileInsert = await supabase
    .from('profiles')
    .insert(initialInsertPayload)
    .select(PROFILE_SELECT)
    .single();

  if (profileInsert.error) {
    if (isSchemaCompatibilityError(profileInsert.error)) {
      const legacyInsert = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          username: buildProfileUsername(user),
          full_name:
            (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
            null,
          onboarding_complete: false,
        })
        .select(LEGACY_PROFILE_SELECT)
        .single();

      if (legacyInsert.error && legacyInsert.error.code !== '23505') {
        throw new Error(legacyInsert.error.message);
      }

      if (legacyInsert.data) {
        const fallbackPersona = await getFallbackPersona(supabase, user);
        return normalizeProfileRow(
          legacyInsert.data as Record<string, unknown>,
          fallbackPersona,
        );
      }
    }

    if (profileInsert.error.code === '23505') {
      const retry = await selectProfileRecord(supabase, user);
      if (retry) {
        return retry;
      }
    }

    throw new Error(profileInsert.error.message);
  }

  return profileInsert.data as ProfileRow;
}
