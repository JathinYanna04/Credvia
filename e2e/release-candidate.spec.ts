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

test('release-candidate smoke for core discovery and content surfaces', async ({ page }) => {
  const user = await createRuntimeUser({
    fullName: 'Credvia Release Candidate',
    onboardingComplete: true,
  });
  const community = await getFirstCommunity();

  const membershipResult = await adminSupabase.from('community_memberships').upsert({
    user_id: user.userId,
    community_id: community.id,
    role: 'member',
  });
  expect(membershipResult.error).toBeNull();

  await login(page, user.email, user.password);
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();

  await page.goto('/communities');
  await expect(page.getByRole('heading', { name: /Communities/i })).toBeVisible();
  await expect(page.getByText(community.name).first()).toBeVisible();

  await page.goto('/explore?q=web');
  await expect(page.getByRole('heading', { name: /Explore/i })).toBeVisible();

  await page.goto(`/u/${user.username}`);
  await expect(page.getByText(user.fullName).first()).toBeVisible();

  await page.goto('/post/new');
  await expect(page.getByRole('heading', { name: 'Create a post' })).toBeVisible();
  await page.getByPlaceholder('Post title').fill('Release candidate discussion post');
  await page.getByPlaceholder('Write your question here').fill(
    'This is a release-candidate smoke test for the normal post flow.',
  );
  await page.getByRole('button', { name: 'Create post' }).click();
  await page.waitForURL(/\/post\//, { timeout: 30_000 });
  await expect(page.getByText('Release candidate discussion post')).toBeVisible();

  const postId = page.url().split('/post/')[1];
  expect(postId).toBeTruthy();

  await page.getByRole('button', { name: 'Upvote post' }).click();
  await expect(page.getByText('1').first()).toBeVisible();

  await page.getByPlaceholder('Add your answer or perspective').fill(
    'Release-candidate comment on the normal post flow.',
  );
  await page.getByRole('button', { name: 'Publish comment' }).click();
  await expect(page.getByText('Release-candidate comment on the normal post flow.')).toBeVisible();

  await page.goto('/ideas/new');
  await expect(page.getByRole('heading', { name: 'Submit a startup idea' })).toBeVisible();
  await page.getByPlaceholder('Post title').fill('Release candidate startup idea');
  await page.getByPlaceholder('What specific problem are you solving?').fill(
    'Founders need tighter validation before investing heavily in product work.',
  );
  await page.getByPlaceholder('Who is this for?').fill('Early-stage founders');
  await page
    .getByPlaceholder('Describe the solution and why it is meaningfully better.')
    .fill('A structured validation workflow inside Credvia that captures traction and feedback.');
  await page.getByPlaceholder('Market category').fill('saas');
  await page.getByPlaceholder('Monetization model').fill('subscription');
  await page.getByPlaceholder('Write your startup idea here').fill(
    'Release-candidate startup idea body.',
  );
  await page.getByRole('button', { name: 'Create post' }).click();
  await page.waitForURL(/\/ideas\//, { timeout: 30_000 });
  await expect(page.getByText('Release candidate startup idea')).toBeVisible();
  await expect(page.getByText('Validation').first()).toBeVisible();

  await page.getByRole('button', { name: 'Upvote post' }).click();
  await expect(page.getByText('1').first()).toBeVisible();

  await page.getByPlaceholder('Add your answer or perspective').fill(
    'Release-candidate comment on the startup idea flow.',
  );
  await page.getByRole('button', { name: 'Publish comment' }).click();
  await expect(page.getByText('Release-candidate comment on the startup idea flow.')).toBeVisible();
});
