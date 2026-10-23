// 本番（公開中のサイト）を、ログインせずに確かめる。npm run test:prod で動かす
import { add, expect, flick, row, test } from './helpers';

test('開くとスケルトンから一覧に切り替わり、入力欄にフォーカスがある', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#memo')).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#memo')).toBeFocused();
});

test('メモして、払って、取り消せる（ログイン前）', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await add(page, '本番の確認');
  const r = row(page, '本番の確認');
  await flick(page, r, 1);
  await expect(r).toHaveAttribute('data-status', 'doing');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(r).toHaveAttribute('data-status', 'todo');
});

test('本物の Google ログインボタンが出る', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('login-card')).toBeVisible();
  // Google が用意したボタン（iframe）が、ガラスの台の上に描かれる
  await expect(page.getByTestId('login-card').locator('iframe[src*="accounts.google.com/gsi"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('login-card').locator('.gbtn-wrap')).toHaveAttribute('data-state', 'ready');
});

test('プライバシーポリシーが開ける', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'プライバシーポリシー' })).toBeVisible();
});

test('横にはみ出さない', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});

test('API と安全の設定', async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  expect(await (await request.get('/api/me')).json()).toEqual({ user: null });
  expect((await request.get('/api/tasks')).status()).toBe(401);
  // テスト用の入口は本番では開かない
  expect((await request.post('/api/auth/dev', { data: {}, headers: { origin } })).status()).toBe(404);
  // 別サイトからの書き込みは断る
  expect((await request.post('/api/sync', { data: {}, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  const res = await request.get('/');
  expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect((await request.get('/manifest.webmanifest')).ok()).toBeTruthy();
  expect((await request.get('/icon-192.png')).ok()).toBeTruthy();
});
