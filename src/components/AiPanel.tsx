import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GoogleButton } from './GoogleButton';
import { CheckIcon } from './Icons';

export type AiState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'result'; tasks: string[] }
  | { kind: 'error'; limit: boolean }
  | { kind: 'login' };

const SPRING = { type: 'spring', stiffness: 460, damping: 36 } as const;

export function AiPanel({
  state,
  onAdd,
  onRetry,
  onClose,
}: {
  state: AiState;
  onAdd(tasks: string[]): void;
  onRetry(): void;
  onClose(): void;
}) {
  return (
    <AnimatePresence initial={false}>
      {state.kind !== 'closed' && (
        <motion.section
          key="ai"
          className="ai-panel"
          data-testid="ai-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING}
        >
          <motion.div
            className={`ai-card glass${state.kind === 'loading' ? ' is-thinking' : ''}`}
            initial={{ y: -10, scale: 0.97, filter: 'blur(6px)' }}
            animate={{ y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: -10, scale: 0.97 }}
            transition={SPRING}
            layout
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {state.kind === 'loading' && <Thinking key="loading" />}
              {state.kind === 'result' && <Result key={`r-${state.tasks.join('|')}`} tasks={state.tasks} onAdd={onAdd} onClose={onClose} />}
              {state.kind === 'error' && (
                <motion.div key="error" className="ai-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span>{state.limit ? '今日の AI の回数を使い切りました' : '分けられませんでした'}</span>
                  <div className="ai-actions">
                    <button type="button" className="ghost" onClick={onClose}>
                      閉じる
                    </button>
                    {!state.limit && (
                      <button type="button" className="primary" onClick={onRetry}>
                        もう一度
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
              {state.kind === 'login' && (
                <motion.div key="login" className="ai-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <GoogleButton />
                  <div className="ai-actions">
                    <button type="button" className="ghost" onClick={onClose}>
                      閉じる
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Thinking() {
  return (
    <motion.div className="ai-thinking" aria-label="AI が分けています" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[78, 56, 66].map((w, i) => (
        <motion.span
          key={i}
          className="sk sk-line"
          style={{ width: `${w}%` }}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, ...SPRING }}
        />
      ))}
    </motion.div>
  );
}

function Result({ tasks, onAdd, onClose }: { tasks: string[]; onAdd(t: string[]): void; onClose(): void }) {
  const [on, setOn] = useState(() => tasks.map(() => true));
  const chosen = tasks.filter((_, i) => on[i]);
  return (
    <motion.div className="ai-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <ul>
        {tasks.map((t, i) => (
          <motion.li
            key={t}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.04 + i * 0.05, ...SPRING }}
          >
            <button
              type="button"
              className={`ai-item${on[i] ? ' is-on' : ''}`}
              aria-pressed={on[i]}
              onClick={() => setOn((s) => s.map((v, j) => (j === i ? !v : v)))}
            >
              <span className="ai-check">
                <CheckIcon />
              </span>
              <span>{t}</span>
            </button>
          </motion.li>
        ))}
      </ul>
      <div className="ai-actions">
        <button type="button" className="ghost" onClick={onClose}>
          閉じる
        </button>
        <motion.button
          type="button"
          className="primary"
          disabled={!chosen.length}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAdd(chosen)}
        >
          {chosen.length}件を追加
        </motion.button>
      </div>
    </motion.div>
  );
}
