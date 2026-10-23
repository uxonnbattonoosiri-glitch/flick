import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Service Worker のテスト以外では切っておく（毎回まっさらな状態で確かめるため）
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
  },
  // 本番と同じ形（ビルドした Worker と静的ファイル）を、本番と同じ仕組み（workerd）で手元で動かして試す
  webServer: {
    command: `npm run build && npx wrangler d1 migrations apply flick-db --local && npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
