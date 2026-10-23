import { motion } from 'motion/react';
import type { Task } from '../../shared/types';
import type { Filter } from './TaskList';
import { Count } from './Count';

const OPTIONS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'todo', label: '未着手' },
  { key: 'doing', label: '進行中' },
  { key: 'done', label: '完了' },
];

export function Segmented({ value, tasks, onChange }: { value: Filter; tasks: Task[]; onChange(f: Filter): void }) {
  const count = (f: Filter) => (f === 'all' ? tasks.length : tasks.filter((t) => t.status === f).length);
  return (
    <div className="seg glass" role="tablist" aria-label="表示">
      {OPTIONS.map((o) => {
        const on = value === o.key;
        return (
          <motion.button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            className={`seg-btn${on ? ' is-on' : ''}`}
            onClick={() => onChange(o.key)}
            whileTap={{ scale: 0.94 }}
          >
            {on && (
              // 選んだ所へ、ガラスのレンズが伸び縮みしながら移る
              <motion.span
                layoutId="seg-lens"
                className="seg-lens"
                initial={{ scaleX: 1.16, scaleY: 0.86 }}
                animate={{ scaleX: 1, scaleY: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
              />
            )}
            <span className="seg-label">{o.label}</span>
            <Count n={count(o.key)} className="seg-count" />
          </motion.button>
        );
      })}
    </div>
  );
}
