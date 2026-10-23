import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task } from '../shared/types';
import { api, ApiError } from './lib/api';
import {
  addTasks,
  checkAuth,
  drainInbox,
  editTitle,
  getState,
  removeTask,
  restore,
  setStatus,
  useStore,
} from './lib/store';
import { Account } from './components/Account';
import { AiPanel, type AiState } from './components/AiPanel';
import { GoogleButton } from './components/GoogleButton';
import { Segmented } from './components/Segmented';
import { TaskList, type Filter } from './components/TaskList';
import { exitDir, LABEL, type Target } from './components/TaskCard';
import { Toast, type ToastData } from './components/Toast';
import { Skeleton } from './components/Skeleton';

// スケルトンが一瞬だけ見えてチカチカしないよう、最低これだけは見せる
const MIN_SKELETON_MS = 450;
const HINT_KEY = 'flick:hinted';

const memo = () => document.getElementById('memo') as HTMLTextAreaElement;
const composer = () => document.getElementById('composer') as HTMLFormElement;

function nudge(el: HTMLElement) {
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
}

export function App() {
  const tasks = useStore((s) => s.tasks);
  const ready = useStore((s) => s.ready);
  const auth = useStore((s) => s.auth);
  const [minDone, setMinDone] = useState(() => performance.now() >= MIN_SKELETON_MS);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [ai, setAi] = useState<AiState>({ kind: 'closed' });
  const [hinted, setHinted] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const loginRef = useRef<HTMLDivElement>(null);
  const aiText = useRef('');
  const toastId = useRef(0);

  const show = ready && minDone;

  const say = useCallback((text: string, undo?: () => void) => {
    setToast({ id: ++toastId.current, text, undo });
  }, []);

  useEffect(() => {
    if (!minDone) {
      const id = setTimeout(() => setMinDone(true), MIN_SKELETON_MS - performance.now());
      return () => clearTimeout(id);
    }
  }, [minDone]);

  // 起動：受け箱を空にして、ログイン状態を確かめる
  useEffect(() => {
    drainInbox();
    const onInbox = () => drainInbox();
    window.addEventListener('flick:inbox', onInbox);
    document.body.classList.add('is-live');
    checkAuth();

    const params = new URLSearchParams(location.search);
    if (params.get('login') === 'failed') {
      say('ログインできませんでした');
      history.replaceState(null, '', '/');
    }
    return () => window.removeEventListener('flick:inbox', onInbox);
  }, [say]);

  const runAi = useCallback(async () => {
    const text = aiText.current;
    if (getState().auth !== 'in') {
      setAi({ kind: 'login' });
      return;
    }
    setAi({ kind: 'loading' });
    try {
      const res = await api<{ tasks: string[] }>('/api/ai/split', {
        method: 'POST',
        body: { text },
        headers: (window as { __flickAiMock?: boolean }).__flickAiMock ? { 'x-flick-ai': 'mock' } : undefined,
      });
      setAi(res.tasks.length ? { kind: 'result', tasks: res.tasks } : { kind: 'error', limit: false });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAi({ kind: 'login' });
      else setAi({ kind: 'error', limit: e instanceof ApiError && e.status === 429 });
    }
  }, []);

  // 入力欄の ✦ ボタン（静的な HTML にある）に動きをつける
  useEffect(() => {
    const btn = document.getElementById('ai') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = false;
    const onClick = () => {
      const text = memo().value.trim();
      if (!text) {
        nudge(composer());
        memo().focus();
        return;
      }
      aiText.current = text;
      runAi();
    };
    btn.addEventListener('click', onClick);
    return () => btn.removeEventListener('click', onClick);
  }, [runAi]);

  useEffect(() => {
    composer()?.classList.toggle('is-thinking', ai.kind === 'loading');
  }, [ai.kind]);

  const onFlick = useCallback(
    (task: Task, target: Target, dir: 1 | -1) => {
      const before = [task];
      const undo = () => restore(before);
      if (target === 'delete') {
        exitDir.set(task.id, dir);
        removeTask(task);
        say('削除しました', undo);
      } else {
        if (filter !== 'all' && filter !== target) exitDir.set(task.id, dir);
        setStatus(task, target);
        say(target === 'todo' ? '未着手に戻しました' : `${LABEL[target]}にしました`, undo);
      }
      if (!hinted) {
        setHinted(true);
        try {
          localStorage.setItem(HINT_KEY, '1');
        } catch {
          /* 覚えられなくても動作に影響しない */
        }
      }
    },
    [filter, hinted, say],
  );

  const onRename = useCallback((task: Task, title: string) => {
    const latest = getState().tasks.find((t) => t.id === task.id) ?? task;
    editTitle(latest, title);
  }, []);

  const addFromAi = (list: string[]) => {
    addTasks(list);
    const m = memo();
    m.value = '';
    m.dispatchEvent(new Event('input'));
    setAi({ kind: 'closed' });
    setFilter((f) => (f === 'all' || f === 'todo' ? f : 'all'));
    say(`${list.length}件を追加しました`);
  };

  const hintId = !hinted && filter === 'all' ? ([...tasks].sort((a, b) => b.position - a.position).find((t) => t.status === 'todo')?.id ?? null) : null;

  return (
    <>
      <Account
        onLoginWanted={() => {
          if (loginRef.current) {
            loginRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nudge(loginRef.current);
          }
        }}
      />
      <AiPanel
        state={ai}
        onAdd={addFromAi}
        onRetry={runAi}
        onClose={() => setAi({ kind: 'closed' })}
      />
      <AnimatePresence mode="wait" initial={false}>
        {show ? (
          <motion.main
            key="app"
            className="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <Segmented value={filter} tasks={tasks} onChange={setFilter} />
            </motion.div>
            <AnimatePresence initial={false}>
              {auth === 'out' && (
                <motion.div
                  key="login"
                  ref={loginRef}
                  className="login-card glass"
                  data-testid="login-card"
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                >
                  <GoogleButton />
                  <a className="privacy-link" href="/privacy">
                    プライバシーポリシー
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
            <TaskList
              tasks={tasks}
              filter={filter}
              editing={editing}
              hintId={hintId}
              onFlick={onFlick}
              onEdit={setEditing}
              onRename={onRename}
            />
          </motion.main>
        ) : (
          <Skeleton key="skeleton" />
        )}
      </AnimatePresence>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
