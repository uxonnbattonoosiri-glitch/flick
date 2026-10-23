import { defineConfig, devices } from '@playwright/test';

// 公開中のサイトを確かめる設定（手元のサーバーは立てない）
export default defineConfig({
  testDir: 'tests',
  testMatch: 'production.spec.ts',
  timeout: 40_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PROD_URL ?? 'https://flick.formesartart.workers.dev',
    serviceWorkers: 'block',
    locale: 'ja-JP',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
