import { expect, test } from '@playwright/test';

test('google oauth sign-in initiation redirects away from the local login page', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect
    .poll(
      () => page.url(),
      { timeout: 30_000 },
    )
    .toMatch(/auth\/v1\/authorize|accounts\.google\.com/i);
});
