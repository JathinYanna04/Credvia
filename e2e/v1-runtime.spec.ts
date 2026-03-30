import { expect, test } from '@playwright/test';
import {
  adminSupabase,
  createRuntimeUser,
  getFirstCommunity,
  getFirstSkill,
} from './helpers/supabase';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('onboarding, shell data, notifications, profile update, and logout work in a real browser session', async ({
  page,
}) => {
  const user = await createRuntimeUser({ fullName: 'Credvia Runtime User' });
  const skill = await getFirstSkill();
  const community = await getFirstCommunity();

  await login(page, user.email, user.password);
  await page.waitForURL(/\/onboarding\/interests/, { timeout: 30_000 });
  await page.getByRole('button', { name: skill.name }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/\/onboarding\/communities/, { timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(community.name) }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/\/onboarding\/profile/, { timeout: 30_000 });
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Full name').fill(user.fullName);
  await page.getByPlaceholder('Headline').fill('Shipping V1 with confidence.');
  await page.getByPlaceholder('Location').fill('Kolkata');
  await page.getByRole('button', { name: 'Complete onboarding' }).click();

  await page.waitForURL(/\/feed/, { timeout: 30_000 });
  await expect(page.getByText(user.fullName).first()).toBeVisible();
  await expect(page.locator(`a[href="/c/${community.slug}"]`).first()).toBeVisible();

  const modAccess = await page.request.get('/api/v1/mod');
  expect(modAccess.status()).toBe(403);

  const headlineUpdate = await page.request.patch('/api/v1/users/me', {
    data: {
      headline: 'Updated through authenticated runtime verification.',
    },
  });
  expect(headlineUpdate.status()).toBe(200);

  const notificationInsert = await adminSupabase.from('notifications').insert({
    user_id: user.userId,
    notif_type: 'vote',
    actor_user_id: null,
    entity_type: 'post',
    entity_id: null,
    payload: { source: 'e2e' },
  });
  expect(notificationInsert.error).toBeNull();

  await page.goto('/feed');
  await page.reload();
  await expect(page.locator('a[href="/notifications"] span').first()).toHaveText('1');

  await page.goto('/notifications');
  await expect(
    page.locator('article').filter({ hasText: 'voted on your post.' }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect.poll(async () => {
    const result = await adminSupabase
      .from('notifications')
      .select('read_at')
      .eq('user_id', user.userId)
      .maybeSingle();

    return result.data?.read_at ?? null;
  }).not.toBeNull();

  await page.goto(`/u/${user.username}`);
  await expect(page.getByText('Updated through authenticated runtime verification.')).toBeVisible();

  await page.getByRole('button', { name: /Sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('moderator queue and moderation actions work in a real browser session', async ({ page }) => {
  const user = await createRuntimeUser({
    fullName: 'Credvia Moderator',
    onboardingComplete: true,
  });
  const community = await getFirstCommunity();

  const membershipResult = await adminSupabase.from('community_memberships').upsert({
    user_id: user.userId,
    community_id: community.id,
    role: 'moderator',
  });
  expect(membershipResult.error).toBeNull();

  const postInsert = await adminSupabase
    .from('posts')
    .insert({
      title: 'Moderation queue verification post',
      body_md: 'Temporary content for moderator flow verification.',
      body_html: '<p>Temporary content for moderator flow verification.</p>',
      post_type: 'discussion',
      author_id: user.userId,
      community_id: community.id,
      status: 'published',
    })
    .select('id')
    .single();

  expect(postInsert.error).toBeNull();
  if (!postInsert.data) {
    throw new Error('Expected moderation test post to be created.');
  }

  const reportInsert = await adminSupabase
    .from('reports')
    .insert({
      reporter_user_id: user.userId,
      target_type: 'post',
      target_id: postInsert.data.id,
      reason_code: 'other',
      details: 'E2E moderation verification report',
      status: 'open',
    })
    .select('id')
    .single();

  expect(reportInsert.error).toBeNull();
  if (!reportInsert.data) {
    throw new Error('Expected moderation test report to be created.');
  }

  await login(page, user.email, user.password);
  await page.waitForURL(/\/feed/, { timeout: 30_000 });

  await page.goto('/mod');
  await expect(page.locator('p', { hasText: 'Moderation queue verification post' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).first().click();

  await expect.poll(async () => {
    const report = await adminSupabase
      .from('reports')
      .select('status')
      .eq('id', reportInsert.data.id)
      .single();
    return report.data?.status ?? null;
  }).toBe('actioned');

  await expect.poll(async () => {
    const post = await adminSupabase
      .from('posts')
      .select('status')
      .eq('id', postInsert.data.id)
      .single();
    return post.data?.status ?? null;
  }).toBe('removed');
});
