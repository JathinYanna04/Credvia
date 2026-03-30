import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1440, height: 960 },
  },
});
