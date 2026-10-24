import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/updates', workers: 1, fullyParallel: false, timeout: 45000,
  expect: { timeout: 15000 },
  use: { serviceWorkers: 'allow', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
});
