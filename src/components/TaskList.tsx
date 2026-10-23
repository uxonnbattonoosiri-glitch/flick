import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { STATUSES, type Status, type Task } from '../../shared/types';
import { LABEL, TaskCard, type Target } from './TaskCard';
import { Count } from './Count';

export type Filter = 'all' | Status;

type Item = { kind: 'head'; status: Status; count: number } | { kind: 'task'; task: Task; index: number };

interface Props {
  tasks: Task[];
  filter: Filter;
  editing: string | null;
  hintId: string | null;
  onFlick(task: Task, target: Target, dir: 1 | -1): void;
  onEdit(id: string | null): void;
  onRename(task: Task, title: string): void;
}

export function TaskList({ tasks, filter, editing, hintId, onFlick, onEdit, onRename }: Props) {
  const first = useRef(true);
  useEffect(() => {
    const id = setTimeout(() => (first.current = false), 900);
    return () => clearTimeout(id);
  }, []);

  const items = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.position - a.position);
    const out: Item[] = [];
    let i = 0;
    for (const status of STATUSES) {
      if (filter !== 'all' && filter !== status) continue;
      const group = sorted.filter((t) => t.status === status);
      if (!group.length) continue;
      if (filter === 'all') out.push({ kind: 'head', status, count: group.length });
      for (const task of group) out.push({ kind: 'task', task, index: i++ });
    }
    return out;
  }, [tasks, filter]);

  // 編集中は、カードの外を触ったら閉じる
  useEffect(() => {
    if (!editing) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(`[data-id="${editing}"]`)) onEdit(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [editing, onEdit]);

  if (!items.length) {
    return (
      <motion.div
        className="empty"
        data-testid="empty"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <motion.span
          className="orb glass"
          animate={{ scale: [1, 1.06, 1], y: [0, -4, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    );
  }

  return (
    <ul className="list" aria-label="タスク">
      <AnimatePresence initial mode="popLayout">
        {items.map((item) =>
          item.kind === 'head' ? (
            <motion.li
              layout
              key={`head-${item.status}`}
              className={`section-head tone-${item.status}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            >
              <span className="dot" />
              {LABEL[item.status]}
              <Count n={item.count} />
            </motion.li>
          ) : (
            <TaskCard
              key={item.task.id}
              task={item.task}
              index={item.index}
              stagger={first.current}
              editing={editing === item.task.id}
              hint={hintId === item.task.id}
              onFlick={onFlick}
              onEdit={onEdit}
              onRename={onRename}
            />
          ),
        )}
      </AnimatePresence>
    </ul>
  );
}
