import { useSyncExternalStore } from 'react';
import type { Status, Task, User } from '../../shared/types';
import { api, ApiError } from './api';

export type Auth = 'unknown' | 'in' | 'out';

interface State {
  tasks: Task[];
  user: User | null;
  auth: Auth;
  /** 画面に一覧を出してよいか（キャッシュがある・未ログインと分かった・最初の同期が済んだ） */
  ready: boolean;
}

interface Saved {
  tasks: Task[];
  pending: Record<string, Task>;
  user: User | null;
  /** 端末に残っているタスクが誰のものか。null はログイン前に書いたもの */
  owner: string | null;
}

const KEY = 'flick:v1';
const INBOX = 'flick:inbox';

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* 読めなければ空から始める */
  }
  return { tasks: [], pending: {}, user: null, owner: null };
}

const saved = load();
let pending: Record<string, Task> = saved.pending;
let owner: string | null = saved.owner;
const hadCache = saved.tasks.length > 0 || saved.user !== null;

let state: State = {
  tasks: saved.tasks,
  user: saved.user,
  auth: 'unknown',
  ready: hadCache,
};

const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tasks: state.tasks, pending, user: state.user, owner } satisfies Saved));
  } catch {
    /* 容量いっぱいなどは無視して画面は動かし続ける */
  }
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pick(state),
  );
}

export const getState = () => state;

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function put(changed: Task[]) {
  const map = new Map(state.tasks.map((t) => [t.id, t]));
  for (const t of changed) {
    pending[t.id] = t;
    if (t.deleted) map.delete(t.id);
    else map.set(t.id, t);
  }
  set({ tasks: [...map.values()] });
  scheduleSync();
}

export function addTasks(titles: string[], baseTime = Date.now()) {
  const list = titles.map((t) => t.trim()).filter(Boolean);
  // 先に書いたものが上に来るよう、少しずつ時刻をずらす
  const created = list.map<Task>((title, i) => ({
    id: uid(),
    title: title.slice(0, 500),
    status: 'todo',
    position: baseTime + (list.length - i) / 1000,
    createdAt: baseTime,
    updatedAt: baseTime,
  }));
  if (created.length) put(created);
  return created;
}

export function setStatus(task: Task, status: Status) {
  const now = Date.now();
  put([{ ...task, status, position: now, updatedAt: now }]);
}

export function editTitle(task: Task, title: string) {
  const t = title.trim();
  if (!t || t === task.title) return;
  put([{ ...task, title: t.slice(0, 500), updatedAt: Date.now() }]);
}

export function removeTask(task: Task) {
  put([{ ...task, deleted: true, updatedAt: Date.now() }]);
}

/** 取り消し。前の状態を、新しい更新時刻で書き戻す */
export function restore(before: Task[]) {
  const now = Date.now();
  put(before.map((t) => ({ ...t, deleted: false, updatedAt: now })));
}

/** boot.js が受け箱に入れたメモを取り出してタスクにする */
export function drainInbox() {
  let box: { text: string; at: number }[] = [];
  try {
    box = JSON.parse(localStorage.getItem(INBOX) || '[]');
    localStorage.removeItem(INBOX);
  } catch {
    return [];
  }
  if (!Array.isArray(box) || !box.length) return [];
  return addTasks(box.map((b) => String(b.text ?? '')), Math.max(...box.map((b) => Number(b.at) || 0), Date.now()));
}

// ---- 同期 ----

let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = false;
let again = false;
let backoff = 0;
let firstSync = true;

function scheduleSync(delay = 350) {
  if (state.auth !== 'in') return;
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

export async function sync() {
  if (state.auth !== 'in') return;
  if (inflight) {
    again = true;
    return;
  }
  inflight = true;
  const sent = Object.values(pending).slice(0, 200);
  try {
    const { tasks } = await api<{ tasks: Task[] }>('/api/sync', { method: 'POST', body: { changes: sent } });
    // 送っている間に、また変わったものは残す
    for (const t of sent) if (pending[t.id]?.updatedAt === t.updatedAt) delete pending[t.id];
    const map = new Map(tasks.map((t) => [t.id, t]));
    for (const p of Object.values(pending)) {
      if (p.deleted) map.delete(p.id);
      else map.set(p.id, p);
    }
    backoff = 0;
    firstSync = false;
    set({ tasks: [...map.values()], ready: true });
    if (Object.keys(pending).length) again = true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      set({ auth: 'out', user: null, ready: true });
    } else {
      backoff = Math.min(backoff ? backoff * 2 : 2000, 60_000);
      clearTimeout(timer);
      timer = setTimeout(sync, backoff);
      // 通信できなくても、手元のデータで画面は出す
      if (firstSync) set({ ready: true });
    }
  } finally {
    inflight = false;
    if (again) {
      again = false;
      scheduleSync(50);
    }
  }
}

export async function checkAuth() {
  try {
    const { user } = await api<{ user: User | null }>('/api/me');
    if (!user) {
      set({ auth: 'out', user: null, ready: true });
      return;
    }
    if (owner && owner !== user.id) {
      // 別の人の端末データは持ち越さない
      pending = {};
      set({ tasks: [] });
    }
    owner = user.id;
    set({ user, auth: 'in' });
    await sync();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) set({ auth: 'out', user: null, ready: true });
    // 通信できないときは、前にログインしていたなら手元のデータのまま使う
    else set({ auth: state.user ? 'in' : 'out', ready: true });
  }
}

function forget() {
  pending = {};
  owner = null;
  set({ tasks: [], user: null, auth: 'out', ready: true });
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* 通信できなくても手元は消す */
  }
  forget();
}

/** サーバーのデータを全部消してから、手元も消す（失敗したら手元は残す） */
export async function deleteAccount() {
  await api('/api/me', { method: 'DELETE' });
  forget();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => scheduleSync(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0);
  });
}
