import { expect, test } from '@playwright/test';
import { adminSupabase, createRuntimeUser, getFirstCommunity } from './helpers/supabase';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/feed/, { timeout: 30_000 });
}

test('homepage post vote stays visible and persists after reload', async ({ page }) => {
  const nonce = Date.now().toString(36);
  const postTitle = `Homepage vote persistence test post ${nonce}`;
  const user = await createRuntimeUser({
    fullName: 'Credvia Feed Vote User',
    onboardingComplete: true,
  });
  const community = await getFirstCommunity();

  const membershipResult = await adminSupabase.from('community_memberships').upsert({
    user_id: user.userId,
    community_id: community.id,
    role: 'member',
  });
  expect(membershipResult.error).toBeNull();

  const postInsert = await adminSupabase
    .from('posts')
    .insert({
      title: postTitle,
      body_md: 'This post exists to verify homepage voting persistence.',
      body_html: '<p>This post exists to verify homepage voting persistence.</p>',
      post_type: 'discussion',
      author_id: user.userId,
      community_id: community.id,
      status: 'published',
    })
    .select('id')
    .single();

  expect(postInsert.error).toBeNull();
  if (!postInsert.data) {
    throw new Error('Expected homepage vote test post to be created.');
  }

  await login(page, user.email, user.password);
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');

  const card = page.locator('article').filter({ hasText: postTitle }).first();
  await expect(card).toBeVisible();

  const score = card.locator('span[aria-live="polite"]').first();
  const upvoteButton = card.getByRole('button', { name: 'Upvote post' }).first();
  await expect(score).toHaveText('0');

  await upvoteButton.click();

  await expect.poll(async () => {
    const result = await adminSupabase
      .from('votes')
      .select('value')
      .eq('user_id', user.userId)
      .eq('entity_type', 'post')
      .eq('entity_id', postInsert.data.id)
      .maybeSingle();

    return result.data?.value ?? null;
  }).toBe(1);

  await expect(score).toHaveText('1');
  await expect(upvoteButton).toHaveClass(/text-accent/);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const reloadedCard = page.locator('article').filter({ hasText: postTitle }).first();
  const reloadedUpvoteButton = reloadedCard.getByRole('button', { name: 'Upvote post' }).first();
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedCard.locator('span[aria-live="polite"]').first()).toHaveText('1');
  await expect(reloadedUpvoteButton).toHaveClass(/text-accent/);
});
