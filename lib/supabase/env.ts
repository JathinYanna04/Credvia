function maskKey(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 10)}***`;
}

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

export function getSupabasePublishableKey() {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

  if (publishableKey) {
    return {
      key: publishableKey,
      source: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
    } as const;
  }

  if (anonKey) {
    return {
      key: anonKey,
      source: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    } as const;
  }

  return null;
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function getSupabaseEnvDebug() {
  const url = getSupabaseUrl();
  const publishable = getSupabasePublishableKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return {
    hasUrl: Boolean(url),
    urlHost: url ? new URL(url).host : null,
    hasPublishableDefaultKey: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    ),
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    resolvedPublishableKeySource: publishable?.source ?? null,
    resolvedPublishableKeyPrefix: maskKey(publishable?.key ?? null),
    serviceRoleKeyPrefix: maskKey(serviceRoleKey),
  };
}

export function getRequiredSupabaseBrowserConfig() {
  const url = getSupabaseUrl();
  const publishable = getSupabasePublishableKey();

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL for Supabase client initialization.',
    );
  }

  if (!publishable?.key) {
    throw new Error(
      'Missing Supabase publishable key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return {
    url,
    key: publishable.key,
    source: publishable.source,
  };
}
