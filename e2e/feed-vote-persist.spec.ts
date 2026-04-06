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

async function createFeedVoteFixture(titlePrefix: string) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const postTitle = `${titlePrefix} ${nonce}`;
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

  return {
    user,
    postId: postInsert.data.id,
    postTitle,
  };
}

async function waitForVoteResponse(
  page: import('@playwright/test').Page,
  postId: string,
  click: () => Promise<void>,
) {
  const voteRequestPath = `/api/v1/posts/${postId}/vote`;
  const voteResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      response.url().includes(voteRequestPath) &&
      response.status() === 200
    );
  });

  await click();
  const voteResponse = await voteResponsePromise;
  return voteResponse.json().catch(() => null);
}

test('homepage post vote stays visible and persists after reload', async ({ page }) => {
  const fixture = await createFeedVoteFixture('Homepage vote persistence test post');

  await login(page, fixture.user.email, fixture.user.password);
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');

  const card = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  await expect(card).toBeVisible();

  const score = card.locator('span[aria-live="polite"]').first();
  const upvoteButton = card.getByRole('button', { name: 'Upvote post' }).first();
  await expect(score).toHaveText('0');

  const votePayload = await waitForVoteResponse(page, fixture.postId, async () => {
    await upvoteButton.click();
  });

  expect(votePayload?.data?.currentUserVote).toBe(1);
  await expect(upvoteButton).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });

  await expect(score).toHaveText('1');
  await expect(upvoteButton).toHaveClass(/text-accent/);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const reloadedCard = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  const reloadedUpvoteButton = reloadedCard.getByRole('button', { name: 'Upvote post' }).first();
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedCard.locator('span[aria-live="polite"]').first()).toHaveText('1');
  await expect(reloadedUpvoteButton).toHaveClass(/text-accent/);
});

test('homepage downvote stays visible and persists after reload', async ({ page }) => {
  const fixture = await createFeedVoteFixture('Homepage downvote persistence test post');

  await login(page, fixture.user.email, fixture.user.password);
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');

  const card = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  await expect(card).toBeVisible();

  const score = card.locator('span[aria-live="polite"]').first();
  const downvoteButton = card.getByRole('button', { name: 'Downvote post' }).first();
  await expect(score).toHaveText('0');

  const votePayload = await waitForVoteResponse(page, fixture.postId, async () => {
    await downvoteButton.click();
  });

  expect(votePayload?.data?.currentUserVote).toBe(-1);
  await expect(downvoteButton).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await expect(score).toHaveText('-1');
  await expect(downvoteButton).toHaveClass(/text-danger/);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const reloadedCard = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  const reloadedDownvoteButton = reloadedCard.getByRole('button', { name: 'Downvote post' }).first();
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedCard.locator('span[aria-live="polite"]').first()).toHaveText('-1');
  await expect(reloadedDownvoteButton).toHaveClass(/text-danger/);
});

test('homepage toggled neutral vote persists after reload', async ({ page }) => {
  const fixture = await createFeedVoteFixture('Homepage neutral toggle persistence test post');

  await login(page, fixture.user.email, fixture.user.password);
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');

  const card = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  await expect(card).toBeVisible();

  const score = card.locator('span[aria-live="polite"]').first();
  const upvoteButton = card.getByRole('button', { name: 'Upvote post' }).first();
  await expect(score).toHaveText('0');

  const firstVotePayload = await waitForVoteResponse(page, fixture.postId, async () => {
    await upvoteButton.click();
  });

  expect(firstVotePayload?.data?.currentUserVote).toBe(1);
  await expect(upvoteButton).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await expect(score).toHaveText('1');

  const secondVotePayload = await waitForVoteResponse(page, fixture.postId, async () => {
    await upvoteButton.click();
  });

  expect(secondVotePayload?.data?.currentUserVote).toBe(0);
  await expect(upvoteButton).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  await expect(score).toHaveText('0');
  await expect(upvoteButton).not.toHaveClass(/text-accent/);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const reloadedCard = page.locator('article').filter({ hasText: fixture.postTitle }).first();
  const reloadedUpvoteButton = reloadedCard.getByRole('button', { name: 'Upvote post' }).first();
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedCard.locator('span[aria-live="polite"]').first()).toHaveText('0');
  await expect(reloadedUpvoteButton).not.toHaveClass(/text-accent/);
});
