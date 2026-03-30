import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createResumeDocxFixture } from './helpers/files';
import { adminSupabase, createRuntimeUser } from './helpers/supabase';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/feed/, { timeout: 30_000 });
}

test('career match ui works from resume upload through match detail', async ({
  page,
}, testInfo) => {
  const user = await createRuntimeUser({
    fullName: 'Credvia Career Match',
    onboardingComplete: true,
  });
  const docxPath = await createResumeDocxFixture(path.join(testInfo.outputDir, 'resume-fixtures'));

  await login(page, user.email, user.password);

  await page.goto('/resume');
  await expect(page.getByRole('heading', { name: 'Resume', exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(docxPath);
  await expect(page.getByText('Resume uploaded. Run analysis to turn it into a match profile.')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /career-match-e2e\.docx/i }).first()).toBeVisible();

  await page.getByRole('button', { name: /Analyze resume|Rerun analysis/ }).click();

  await expect.poll(
    async () => {
      const result = await adminSupabase
        .from('resumes')
        .select('parse_status')
        .eq('user_id', user.userId)
        .eq('is_active', true)
        .maybeSingle();

      return result.data?.parse_status ?? null;
    },
    { timeout: 60_000 },
  ).toBe('parsed');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Extracted profile' })).toBeVisible();
  await expect(page.getByText('React')).toBeVisible();

  await page.goto('/career-match');
  await expect(page.getByRole('heading', { name: 'Career Match' })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh matches' }).click();

  await expect.poll(
    async () => {
      const result = await adminSupabase
        .from('job_matches')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.userId);

      return result.count ?? 0;
    },
    { timeout: 60_000 },
  ).toBeGreaterThan(0);

  await page.reload();
  const firstMatchLink = page.locator('a[href^="/career-match/"]').first();
  await expect(firstMatchLink).toBeVisible({ timeout: 30_000 });
  await firstMatchLink.click();
  await page.waitForURL(/\/career-match\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('button', { name: 'Save match' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Save match' }).first().click();
  await expect(page.getByRole('button', { name: 'Saved' }).first()).toBeVisible();
  await expect(page.getByText('Role context')).toBeVisible();

  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Startup jobs' })).toBeVisible();
  const firstJobLink = page.locator('a[href^="/jobs/"]').first();
  await expect(firstJobLink).toBeVisible({ timeout: 30_000 });
  await firstJobLink.click();
  await page.waitForURL(/\/jobs\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'Apply on company site' })).toBeVisible();
});
