import { add, expect, flick, login, open, origin, row, serverTasks, test } from './helpers';

/** アプリ本体の JS を遅らせて「読み込み中」を作る */
async function slowApp(page: import('@playwright/test').Page, ms = 1500) {
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test.describe('開いた瞬間', () => {
  test('全画面のスケルトンが出て、読み込み後に一覧へ切り替わる', async ({ page }) => {
    await slowApp(page);
    // 読み込みの完了は待たずに、届いた直後の画面を見る
    await page.goto('/', { waitUntil: 'commit' });
    const sk = page.getByTestId('skeleton');
    await expect(sk).toBeVisible();
    const box = (await sk.boundingBox())!;
    const vh = page.viewportSize()!.height;
    // 入力欄の下から画面の下まで、ほぼ全部を覆う
    expect(box.y + box.height).toBeGreaterThan(vh * 0.95);
    await expect(page.locator('main')).toBeVisible();
    await expect(sk).toHaveCount(0);
  });

  test('入力欄は最初からフォーカスされている', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#memo')).toBeFocused();
  });

  test('アプリの JS が届く前に書いたメモも、タスクになる', async ({ page }) => {
    await slowApp(page, 2000);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await page.locator('#memo').fill('読み込み中に書いたメモ');
    await page.locator('#memo').press('Enter');
    await expect(page.locator('#memo')).toHaveValue('');
    await expect(page.locator('main')).toBeVisible();
    await expect(row(page, '読み込み中に書いたメモ')).toBeVisible();
  });
});

test.describe('メモ', () => {
  test('Enter で追加。改行を含むと行ごとに分かれる。空では追加しない', async ({ page }) => {
    await open(page);
    await add(page, '一つ目');
    const memo = page.locator('#memo');
    await memo.fill('二つ目\n三つ目');
    await memo.press('Enter');
    await expect(row(page, '二つ目')).toBeVisible();
    await expect(row(page, '三つ目')).toBeVisible();
    await memo.fill('   ');
    await memo.press('Enter');
    await expect(page.getByTestId('task')).toHaveCount(3);
  });

  test('日本語の変換を確定する Enter では追加しない', async ({ page }) => {
    await open(page);
    await page.locator('#memo').fill('へんかんちゅう');
    await page.locator('#memo').evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#memo')).toHaveValue('へんかんちゅう');
    await expect(page.getByTestId('task')).toHaveCount(0);
  });

  test('送るボタンは文字があるときだけ出る', async ({ page }) => {
    await open(page);
    await expect(page.locator('#send')).toHaveCSS('opacity', '0');
    await page.locator('#memo').fill('a');
    await expect(page.locator('#send')).toHaveCSS('opacity', '1');
    await page.locator('#send').click();
    await expect(row(page, 'a')).toBeVisible();
  });

  test('再読み込みしても残る', async ({ page }) => {
    await open(page);
    await add(page, '消えないメモ');
    await page.reload();
    await expect(row(page, '消えないメモ')).toBeVisible();
  });
});

test.describe('フリック', () => {
  test('右で 未着手→進行中→完了→削除、左で戻る。サーバーにも残る', async ({ page }) => {
    await login(page);
    await open(page);
    await add(page, 'フリックの練習');
    const r = row(page, 'フリックの練習');
    await expect(r).toHaveAttribute('data-status', 'todo');

    await flick(page, r, 1);
    await expect(r).toHaveAttribute('data-status', 'doing');
    await expect(page.getByTestId('toast')).toContainText('進行中にしました');

    await flick(page, r, 1);
    await expect(r).toHaveAttribute('data-status', 'done');

    await flick(page, r, -1);
    await expect(r).toHaveAttribute('data-status', 'doing');

    await expect.poll(async () => (await serverTasks(page)).find((t) => t.title === 'フリックの練習')?.status).toBe('doing');

    await flick(page, r, 1);
    await flick(page, r, 1);
    await expect(r).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('削除しました');
    await expect.poll(async () => (await serverTasks(page)).some((t) => t.title === 'フリックの練習')).toBe(false);
  });

  test('少しだけ動かしたときと、未着手を左に払ったときは何も変わらない', async ({ page }) => {
    await open(page);
    await add(page, '動かない');
    const r = row(page, '動かない');
    await flick(page, r, 1, 0.12);
    await expect(r).toHaveAttribute('data-status', 'todo');
    await flick(page, r, -1);
    await expect(r).toHaveAttribute('data-status', 'todo');
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('「元に戻す」で直前の操作を取り消せる', async ({ page }) => {
    await open(page);
    await add(page, '取り消し');
    const r = row(page, '取り消し');
    await flick(page, r, 1);
    await expect(r).toHaveAttribute('data-status', 'doing');
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(r).toHaveAttribute('data-status', 'todo');

    await flick(page, r, 1);
    await flick(page, r, 1);
    await flick(page, r, 1);
    await expect(r).toHaveCount(0);
    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect(r).toHaveAttribute('data-status', 'done');
  });

  test('一瞬で払っても、タップと間違えて編集が開いたりしない', async ({ page }) => {
    await open(page);
    await add(page, '素早く');
    const card = row(page, '素早く').locator('[data-testid=task]');
    for (let i = 0; i < 3; i++) {
      const box = (await card.boundingBox())!;
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 60, y);
      await page.mouse.down();
      await page.mouse.move(box.x + 60 + box.width * 0.7, y, { steps: 2 });
      await page.mouse.up();
      await expect(page.getByRole('textbox', { name: 'タスクの内容' })).toHaveCount(0);
      if (i === 0) await expect(row(page, '素早く')).toHaveAttribute('data-status', 'doing');
      if (i === 1) await expect(row(page, '素早く')).toHaveAttribute('data-status', 'done');
    }
    await expect(row(page, '素早く')).toHaveCount(0);
  });

  test('丸を押すと次の状態に進む', async ({ page }) => {
    await open(page);
    await add(page, '丸で進める');
    const r = row(page, '丸で進める');
    await r.locator('.mark-btn').click();
    await expect(r).toHaveAttribute('data-status', 'doing');
    await r.locator('.mark-btn').click();
    await expect(r).toHaveAttribute('data-status', 'done');
  });
});

test('指（タッチ）で払っても動く。左の丸の上から払い始めても丸は反応しない', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || !info.project.use.hasTouch, 'タッチを直接送れるのは、タッチ画面の Chromium だけ');
  await open(page);
  await add(page, 'タッチ');
  const card = row(page, 'タッチ').locator('[data-testid=task]');
  const box = (await card.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  // 丸（左から 14〜40px）の真ん中から払い始める
  const x0 = box.x + 27;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  // 本物の指と同じく、1 コマ（約 16ms）ごとに少しずつ動かす
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 20, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(row(page, 'タッチ')).toHaveAttribute('data-status', 'doing');
  // 指を離したときに丸の「押した」が重ならず、進行中のまま止まっている
  await page.waitForTimeout(500);
  await expect(row(page, 'タッチ')).toHaveAttribute('data-status', 'doing');
});

test.describe('編集と絞り込み', () => {
  test('タップで開いて書き換え、状態を選び、削除できる', async ({ page }) => {
    await open(page);
    await add(page, '書き換える前');
    await row(page, '書き換える前').locator('.title').click();
    const editor = page.getByRole('textbox', { name: 'タスクの内容' });
    await expect(editor).toBeFocused();
    await editor.fill('書き換えた後');
    await editor.press('Enter');
    await expect(row(page, '書き換えた後')).toBeVisible();

    await row(page, '書き換えた後').locator('.title').click();
    await page.getByRole('button', { name: '完了', exact: true }).click();
    await expect(row(page, '書き換えた後')).toHaveAttribute('data-status', 'done');

    await row(page, '書き換えた後').locator('.title').click();
    await page.getByRole('button', { name: '削除' }).click();
    await expect(row(page, '書き換えた後')).toHaveCount(0);
  });

  test('上の切り替えで、状態ごとに絞り込める', async ({ page }) => {
    await open(page);
    await add(page, 'A');
    await add(page, 'B');
    await row(page, 'B').locator('.mark-btn').click();
    const tabs = page.getByRole('tablist', { name: '表示' });
    await tabs.getByRole('tab', { name: /進行中/ }).click();
    await expect(page.getByTestId('task')).toHaveCount(1);
    await expect(row(page, 'B')).toBeVisible();
    await tabs.getByRole('tab', { name: /未着手/ }).click();
    await expect(page.getByTestId('task')).toHaveCount(1);
    await expect(row(page, 'A')).toBeVisible();
    // 絞り込み中に右へ払うと、一覧から抜けていく
    await flick(page, row(page, 'A'), 1);
    await expect(page.getByTestId('task')).toHaveCount(0);
    await expect(page.getByTestId('empty')).toBeVisible();
    await tabs.getByRole('tab', { name: /すべて/ }).click();
    await expect(page.getByTestId('task')).toHaveCount(2);
  });
});

test.describe('AI', () => {
  test('ログインしていないと、AI の代わりにログインを促す', async ({ page }) => {
    await open(page);
    await page.locator('#memo').fill('なにか');
    await page.getByRole('button', { name: 'AIで分ける' }).click();
    await expect(page.getByTestId('ai-panel').getByTestId('google-button')).toBeAttached();
  });

  test('長いメモを AI で分けて、選んだものだけ追加する', async ({ page }) => {
    await page.addInitScript(() => ((window as { __flickAiMock?: boolean }).__flickAiMock = true));
    await login(page);
    await open(page);
    await page.locator('#memo').fill('企画書を作る。田中さんにメールする。牛乳を買う');
    await page.getByRole('button', { name: 'AIで分ける' }).click();
    const panel = page.getByTestId('ai-panel');
    await expect(panel.getByRole('button', { name: '牛乳を買う' })).toBeVisible();
    await panel.getByRole('button', { name: '牛乳を買う' }).click();
    await panel.getByRole('button', { name: '2件を追加' }).click();
    await expect(panel).toHaveCount(0);
    await expect(row(page, '企画書を作る')).toBeVisible();
    await expect(row(page, '田中さんにメールする')).toBeVisible();
    await expect(row(page, '牛乳を買う')).toHaveCount(0);
    await expect(page.locator('#memo')).toHaveValue('');
  });

  test('何も書かずに押すと、入力欄が揺れるだけ', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'AIで分ける' }).click();
    await expect(page.locator('#composer')).toHaveClass(/nudge/);
    await expect(page.getByTestId('ai-panel')).toHaveCount(0);
  });
});

test.describe('ログイン', () => {
  test('ログイン前のメモは、ログインするとサーバーに保存される', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('login-card')).toBeVisible();
    await add(page, 'ログイン前のメモ');
    await login(page);
    await page.reload();
    await expect(page.getByTestId('login-card')).toHaveCount(0);
    await expect.poll(async () => (await serverTasks(page)).map((t) => t.title)).toContain('ログイン前のメモ');
  });

  test('別の端末（新しいブラウザ）でも同じタスクが見える', async ({ page, browser }) => {
    const email = await login(page);
    await open(page);
    await add(page, 'どこでも見える');
    await expect.poll(async () => (await serverTasks(page)).length).toBe(1);

    const other = await browser.newContext({ serviceWorkers: 'block' });
    const page2 = await other.newPage();
    await login(page2, email);
    await page2.goto(`${origin}/`);
    await expect(row(page2, 'どこでも見える')).toBeVisible();
    await other.close();
  });

  test('ログアウトすると端末のデータが消え、ログイン欄が出る', async ({ page }) => {
    await login(page);
    await open(page);
    await add(page, 'ログアウトで消える');
    await expect.poll(async () => (await serverTasks(page)).length).toBe(1);
    await page.getByTestId('account').click();
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page.getByTestId('login-card')).toBeVisible();
    await expect(page.getByTestId('task')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('task')).toHaveCount(0);
  });

  test('Google のボタンの場所がある（手元ではクライアント ID がないので代わりのボタン）', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('login-card').getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  });
});

test.describe('安全', () => {
  test('ログインしていないと API は使えない', async ({ request }) => {
    expect((await request.get('/api/tasks')).status()).toBe(401);
    expect((await request.post('/api/sync', { data: { changes: [] }, headers: { origin } })).status()).toBe(401);
    expect((await request.post('/api/ai/split', { data: { text: 'x' }, headers: { origin } })).status()).toBe(401);
  });

  test('ほかのサイトからの書き込みは断る', async ({ page }) => {
    await login(page);
    const res = await page.request.post('/api/sync', {
      data: { changes: [] },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status()).toBe(403);
  });

  test('ほかの人のタスクは見えず、書き換えもできない', async ({ page, browser }) => {
    await login(page);
    const now = Date.now();
    const mine = { id: `task-${now}`, title: 'Aさんのタスク', status: 'todo', position: now, createdAt: now, updatedAt: now };
    await page.request.post('/api/sync', { data: { changes: [mine] }, headers: { origin } });

    const other = await browser.newContext();
    const page2 = await other.newPage();
    await login(page2);
    // 同じ id で上書きしようとしても、自分の分として別に入るだけ
    await page2.request.post('/api/sync', {
      data: { changes: [{ ...mine, title: '乗っ取り', updatedAt: now + 1000 }] },
      headers: { origin },
    });
    expect((await serverTasks(page2)).map((t) => t.title)).toEqual(['乗っ取り']);
    expect((await serverTasks(page)).map((t) => t.title)).toEqual(['Aさんのタスク']);
    await other.close();
  });

  test('おかしなデータは受け付けない', async ({ page }) => {
    await login(page);
    const now = Date.now();
    const bad = [
      { id: 'x', title: '短すぎる id', status: 'todo', position: 1, createdAt: now, updatedAt: now },
      { id: 'ok-id-123', title: '', status: 'todo', position: 1, createdAt: now, updatedAt: now },
      { id: 'ok-id-456', title: '変な状態', status: 'hacked', position: 1, createdAt: now, updatedAt: now },
      { id: "x'); DROP TABLE tasks;--", title: 'SQL', status: 'todo', position: 1, createdAt: now, updatedAt: now },
    ];
    const res = await page.request.post('/api/sync', { data: { changes: bad }, headers: { origin } });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).tasks).toEqual([]);
  });

  test('画面に安全のためのヘッダーが付いている', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('見た目', () => {
  test('どの幅でも横にはみ出さない', async ({ page }) => {
    await open(page);
    await add(page, 'とても長い英数字の並び ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    for (const width of [320, 375, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('ガラスの素材（背景のぼかし）が効いている', async ({ page }) => {
    await open(page);
    const filter = await page.locator('#composer').evaluate((el) => {
      const s = getComputedStyle(el);
      return s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter;
    });
    expect(filter).toContain('blur');
  });

  test('動きを減らす設定の人には、背景の動きを止める', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const anim = await page.locator('.ambient i').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
  });
});

test.describe('オフライン', () => {
  test.use({ serviceWorkers: 'allow' });

  test('一度開けば、通信がなくても開いてメモできる', async ({ page, context, browserName, errors }) => {
    test.skip(browserName !== 'chromium', 'オフラインの再現は Chromium で行う');
    await open(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#memo')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await add(page, '電車の中で書いたメモ');
    await context.setOffline(false);
    // 通信がない間の「読み込めなかった」は想定どおりなので、数えない
    errors.splice(0, errors.length, ...errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)));
  });
});
