import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function readEnvFile() {
  const filePath = path.join(process.cwd(), '.env.local');
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  return Object.fromEntries(
    lines
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^"|"$/g, ''),
        ];
      }),
  );
}

const env = readEnvFile();

function getRequiredEnv(name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const adminSupabase = createClient(
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function createRuntimeUser(options?: {
  fullName?: string;
  onboardingComplete?: boolean;
}) {
  const nonce = Date.now().toString(36);
  const email = `credvia.e2e.${nonce}@example.com`;
  const password = 'CredviaTest123!';
  const fullName = options?.fullName ?? 'Credvia E2E User';

  const createResult = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (createResult.error || !createResult.data.user) {
    throw createResult.error ?? new Error('Could not create test user.');
  }

  const userId = createResult.data.user.id;
  const username = `e2e_${nonce}`.slice(0, 30);

  const userRowResult = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      email,
      auth_provider: 'email',
      account_type: 'professional',
      status: 'active',
    })
    .select('id')
    .maybeSingle();

  if (userRowResult.error && userRowResult.error.code !== '23505') {
    throw new Error(userRowResult.error.message);
  }

  if (options?.onboardingComplete) {
    const profileResult = await adminSupabase
      .from('profiles')
      .insert({
        user_id: userId,
        username,
        full_name: fullName,
        headline: 'E2E moderation verifier',
        onboarding_complete: true,
      });

    if (profileResult.error && profileResult.error.code !== '23505') {
      throw new Error(profileResult.error.message);
    }
  }

  return {
    userId,
    email,
    password,
    username,
    fullName,
  };
}

export async function getFirstSkill() {
  const result = await adminSupabase
    .from('skills')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(1)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

export async function getFirstCommunity() {
  const result = await adminSupabase
    .from('communities')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('member_count', { ascending: false })
    .limit(1)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}
