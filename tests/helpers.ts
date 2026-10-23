import { expect, test as base, type Locator, type Page } from '@playwright/test';

export const origin = 'http://localhost:4173';

/** 毎回まっさらな利用者でログインする（テスト専用の入口。localhost でしか開かない） */
export async function login(page: Page, email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`) {
  const res = await page.request.post('/api/auth/dev', {
    data: { email },
    headers: { origin },
  });
  expect(res.ok()).toBeTruthy();
  return email;
}

export async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
}

export function row(page: Page, title: string) {
  return page.locator('li.task-row', { hasText: title });
}

export async function add(page: Page, title: string) {
  const memo = page.locator('#memo');
  await memo.fill(title);
  await memo.press('Enter');
  await expect(row(page, title)).toBeVisible();
}

/** マウス（ポインター）でカードを横に払う。dir = 1 で右、-1 で左 */
export async function flick(page: Page, target: Locator, dir: 1 | -1, ratio = 0.62) {
  const card = target.locator('[data-testid=task]');
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) await page.mouse.move(x + (dir * box.width * ratio * i) / steps, y + i * 0.3);
  await page.mouse.up();
}

export async function serverTasks(page: Page) {
  const res = await page.request.get('/api/tasks');
  expect(res.ok()).toBeTruthy();
  return (await res.json()).tasks as { id: string; title: string; status: string }[];
}

/** すべてのテストで、ページのエラーとコンソールのエラーを集め、最後に 0 件かを確かめる */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
      await page.addInitScript(() => {
        // はじめての人向けの「横に動く見本」は、テストの操作とぶつかるので済ませた扱いにする
        if (!sessionStorage.getItem('keep-hint')) localStorage.setItem('flick:hinted', '1');
      });
      await use(errors);
      expect(errors, errors.join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
