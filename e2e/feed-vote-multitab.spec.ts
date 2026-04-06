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

test('settled vote in one tab updates another tab', async ({ context, page }) => {
  const nonce = Date.now().toString(36);
  const postTitle = `Multi-tab vote sync post ${nonce}`;
  const user = await createRuntimeUser({
    fullName: 'Credvia Multi Tab Vote User',
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
      body_md: 'This post exists to verify multi-tab vote synchronization.',
      body_html: '<p>This post exists to verify multi-tab vote synchronization.</p>',
      post_type: 'discussion',
      author_id: user.userId,
      community_id: community.id,
      status: 'published',
    })
    .select('id')
    .single();

  expect(postInsert.error).toBeNull();
  if (!postInsert.data) {
    throw new Error('Expected multi-tab vote post to be created.');
  }

  await login(page, user.email, user.password);

  const secondTab = await context.newPage();
  await secondTab.goto('/feed');
  await secondTab.waitForLoadState('networkidle');

  await page.goto('/feed');
  await page.waitForLoadState('networkidle');

  const tabOneCard = page.locator('article').filter({ hasText: postTitle }).first();
  const tabTwoCard = secondTab.locator('article').filter({ hasText: postTitle }).first();

  await expect(tabOneCard).toBeVisible();
  await expect(tabTwoCard).toBeVisible();

  const tabOneScore = tabOneCard.locator('span[aria-live="polite"]').first();
  const tabTwoScore = tabTwoCard.locator('span[aria-live="polite"]').first();

  await expect(tabOneScore).toHaveText('0');
  await expect(tabTwoScore).toHaveText('0');

  const voteRequestPath = `/api/v1/posts/${postInsert.data.id}/vote`;
  const voteResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      response.url().includes(voteRequestPath) &&
      response.status() === 200
    );
  });

  await tabOneCard.getByRole('button', { name: 'Upvote post' }).first().click();
  const voteResponse = await voteResponsePromise;
  const votePayload = await voteResponse.json().catch(() => null);

  expect(votePayload?.data?.currentUserVote).toBe(1);

  await expect(tabOneScore).toHaveText('1');
  await expect(tabTwoScore).toHaveText('1', { timeout: 10_000 });
});
