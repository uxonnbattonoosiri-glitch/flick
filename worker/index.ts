import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { STATUSES, TITLE_MAX, type Status, type Task, type User } from '../shared/types';
import { splitMemo } from './ai';

type App = { Bindings: Env; Variables: { user: User } };

const SESSION_COOKIE = 'flick_session';
const NONCE_COOKIE = 'flick_nonce';
const DAY = 86_400_000;
const SESSION_DAYS = 180;
const SYNC_LIMIT = 200;
const TASK_LIMIT = 5000;

// Google の公開鍵。Worker のインスタンスごとに一度だけ取りに行き、使い回す
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const app = new Hono<App>().basePath('/api');

function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isHttps(url: string) {
  return new URL(url).protocol === 'https:';
}

function isLocal(url: string) {
  const { hostname } = new URL(url);
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

// クッキーを使う API を、ほかのサイトから呼ばせない（CSRF 対策）
app.use('*', async (c, next) => {
  const safe = c.req.method === 'GET' || c.req.method === 'HEAD';
  // Google からの戻りだけは accounts.google.com からの POST なので、nonce で確かめる
  if (!safe && c.req.path !== '/api/auth/google') {
    if (c.req.header('origin') !== new URL(c.req.url).origin) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }
  await next();
  c.header('Cache-Control', 'no-store');
});

async function createSession(c: Parameters<MiddlewareHandler<App>>[0], userId: string) {
  const token = randomToken();
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now + SESSION_DAYS * DAY, now)
    .run();
  setSessionCookie(c, token);
}

function setSessionCookie(c: Parameters<MiddlewareHandler<App>>[0], token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

async function upsertUser(db: D1Database, user: User) {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
    )
    .bind(user.id, user.email, user.name, user.picture, Date.now())
    .run();
}

/** クッキーのセッションから利用者を探す。いなければ null */
async function findUser(c: Parameters<MiddlewareHandler<App>>[0]): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.name, u.picture FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<{ expires_at: number } & User>();
  const now = Date.now();
  if (!row || row.expires_at < now) {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return null;
  }
  // 使っている間は期限を延ばす（残り 150 日を切ったら 180 日に戻す）
  if (row.expires_at - now < (SESSION_DAYS - 30) * DAY) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_DAYS * DAY, hash)
      .run();
    setSessionCookie(c, token);
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture };
}

const requireUser: MiddlewareHandler<App> = async (c, next) => {
  const user = await findUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};

app.get('/config', (c) => c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID || null }));

// Google のボタンに渡す使い捨ての値。戻ってきた ID トークンに同じ値が入っているかを確かめる
app.post('/auth/nonce', (c) => {
  const nonce = randomToken(24);
  setCookie(c, NONCE_COOKIE, nonce, {
    httpOnly: true,
    // Google から POST で戻ってくるときにも送られるよう None にする（https のときだけ使える）
    secure: isHttps(c.req.url),
    sameSite: isHttps(c.req.url) ? 'None' : 'Lax',
    path: '/api/auth',
    maxAge: 600,
  });
  return c.json({ nonce });
});

app.post('/auth/google', async (c) => {
  const form = await c.req.parseBody();
  const credential = typeof form.credential === 'string' ? form.credential : '';
  const csrfBody = typeof form.g_csrf_token === 'string' ? form.g_csrf_token : '';
  const csrfCookie = getCookie(c, 'g_csrf_token');
  const nonce = getCookie(c, NONCE_COOKIE);
  const fail = (reason: string) => c.redirect(`/?login=failed&reason=${reason}`, 303);

  if (!c.env.GOOGLE_CLIENT_ID) return fail('config');
  if (!credential || !nonce) return fail('missing');
  if (csrfCookie && csrfCookie !== csrfBody) return fail('csrf');

  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: c.env.GOOGLE_CLIENT_ID,
    });
    if (payload.nonce !== nonce) return fail('nonce');
    if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) return fail('email');
    const user: User = {
      id: `g:${payload.sub}`,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    };
    await upsertUser(c.env.DB, user);
    await createSession(c, user.id);
    deleteCookie(c, NONCE_COOKIE, { path: '/api/auth' });
    return c.redirect('/', 303);
  } catch {
    return fail('token');
  }
});

// テスト用のログイン。手元（localhost）で .dev.vars に DEV_LOGIN=1 があるときだけ動く
app.post('/auth/dev', async (c) => {
  if (c.env.DEV_LOGIN !== '1' || !isLocal(c.req.url)) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = typeof body.email === 'string' && body.email.includes('@') ? body.email : 'dev@example.test';
  const user: User = { id: `dev:${email}`, email, name: email.split('@')[0], picture: null };
  await upsertUser(c.env.DB, user);
  await createSession(c, user.id);
  return c.json({ user });
});

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ログインしていなくてもエラーにはしない（ブラウザのコンソールを汚さないため）
app.get('/me', async (c) => c.json({ user: await findUser(c) }));

type Row = {
  id: string;
  title: string;
  status: Status;
  position: number;
  created_at: number;
  updated_at: number;
};

const toTask = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  status: r.status,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parseTask(raw: unknown, now: number): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (typeof t.id !== 'string' || !/^[\w-]{8,64}$/.test(t.id)) return null;
  if (typeof t.title !== 'string') return null;
  const title = t.title.trim().slice(0, TITLE_MAX);
  if (!title) return null;
  if (!STATUSES.includes(t.status as Status)) return null;
  const position = num(t.position);
  const createdAt = num(t.createdAt);
  const updatedAt = num(t.updatedAt);
  if (position === null || createdAt === null || updatedAt === null) return null;
  return {
    id: t.id,
    title,
    status: t.status as Status,
    position,
    createdAt: Math.min(createdAt, now),
    // 端末の時計が進みすぎていても、未来の時刻で上書きされ続けないようにする
    updatedAt: Math.min(updatedAt, now + 60_000),
    deleted: t.deleted === true,
  };
}

async function listTasks(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      'SELECT id, title, status, position, created_at, updated_at FROM tasks WHERE user_id = ? AND deleted = 0 ORDER BY position DESC',
    )
    .bind(userId)
    .all<Row>();
  return results.map(toTask);
}

app.get('/tasks', requireUser, async (c) => c.json({ tasks: await listTasks(c.env.DB, c.get('user').id) }));

// 端末で起きた変更をまとめて受け取り、最新の一覧を返す。新しい方（updatedAt が大きい方）が勝つ
app.post('/sync', requireUser, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ changes?: unknown }>().catch(() => ({}) as { changes?: unknown });
  const now = Date.now();
  const changes = (Array.isArray(body.changes) ? body.changes.slice(0, SYNC_LIMIT) : [])
    .map((t) => parseTask(t, now))
    .filter((t): t is Task => t !== null);

  if (changes.length) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?')
      .bind(user.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) + changes.length > TASK_LIMIT) return c.json({ error: 'too many tasks' }, 413);

    const upsert = c.env.DB.prepare(
      `INSERT INTO tasks (user_id, id, title, status, position, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         title = excluded.title, status = excluded.status, position = excluded.position,
         updated_at = excluded.updated_at, deleted = excluded.deleted
       WHERE excluded.updated_at > tasks.updated_at`,
    );
    await c.env.DB.batch([
      ...changes.map((t) =>
        upsert.bind(user.id, t.id, t.title, t.status, t.position, t.createdAt, t.updatedAt, t.deleted ? 1 : 0),
      ),
      // 消して 30 日たったものは片づける
      c.env.DB.prepare('DELETE FROM tasks WHERE user_id = ? AND deleted = 1 AND updated_at < ?').bind(
        user.id,
        now - 30 * DAY,
      ),
    ]);
  }
  return c.json({ tasks: await listTasks(c.env.DB, user.id) });
});

app.post('/ai/split', requireUser, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ text?: unknown }>().catch(() => ({}) as { text?: unknown });
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
  if (!text) return c.json({ error: 'empty' }, 400);

  const day = new Date().toISOString().slice(0, 10);
  const usage = await c.env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(user.id, day)
    .first<{ count: number }>();
  if ((usage?.count ?? 0) > Number(c.env.AI_DAILY_LIMIT || 40)) return c.json({ error: 'limit' }, 429);

  // テストでは AI を呼ばずに決まった答えを返せるようにする（手元だけ）
  const mock = c.env.DEV_LOGIN === '1' && isLocal(c.req.url) && c.req.header('x-flick-ai') === 'mock';
  try {
    const tasks = await splitMemo(c.env, text, mock);
    return c.json({ tasks });
  } catch (e) {
    console.error('ai failed', e);
    return c.json({ error: 'ai' }, 502);
  }
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

export default app;
