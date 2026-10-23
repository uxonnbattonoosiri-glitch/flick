import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  animate,
  motion,
  type Variants,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type PanInfo,
} from 'motion/react';
import type { Status, Task } from '../../shared/types';
import { BackIcon, CheckIcon, PlayIcon, StatusMark, TrashIcon } from './Icons';

export type Target = Status | 'delete';

export const LABEL: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' };
export const NEXT: Record<Status, Target> = { todo: 'doing', doing: 'done', done: 'delete' };
export const PREV: Record<Status, Status | null> = { todo: null, doing: 'todo', done: 'doing' };
const CYCLE: Record<Status, Status> = { todo: 'doing', doing: 'done', done: 'todo' };

/** 一覧から外れるときにどちらへ飛ばすか（TaskList が書き、exit アニメーションが読む） */
export const exitDir = new Map<string, number>();

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.9 } as const;

function revealLook(target: Target | null) {
  if (!target) return { label: '', Icon: () => null, tone: 'none' };
  if (target === 'delete') return { label: '削除', Icon: TrashIcon, tone: 'delete' };
  if (target === 'todo') return { label: LABEL.todo, Icon: BackIcon, tone: 'todo' };
  if (target === 'doing') return { label: LABEL.doing, Icon: PlayIcon, tone: 'doing' };
  return { label: LABEL.done, Icon: CheckIcon, tone: 'done' };
}

interface Props {
  task: Task;
  index: number;
  stagger: boolean;
  editing: boolean;
  hint: boolean;
  onFlick(task: Task, target: Target, dir: 1 | -1): void;
  onEdit(id: string | null): void;
  onRename(task: Task, title: string): void;
}

export function TaskCard({ task, index, stagger, editing, hint, onFlick, onEdit, onRename }: Props) {
  const x = useMotionValue(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const dragged = useRef(false);
  const down = useRef({ x: 0, y: 0 });
  const [armed, setArmed] = useState<0 | 1 | -1>(0);
  const armedRef = useRef<0 | 1 | -1>(0);
  const threshold = useRef(110);

  const next = NEXT[task.status];
  const prev = PREV[task.status];
  const right = revealLook(next);
  const left = revealLook(prev);

  const rightOpacity = useTransform(x, [0, 24, 90], [0, 0.6, 1]);
  const leftOpacity = useTransform(x, [-90, -24, 0], [1, 0.6, 0]);
  const rightIcon = useTransform(x, [0, 110], [0.5, 1]);
  const leftIcon = useTransform(x, [-110, 0], [1, 0.5]);
  // ガラスの光が指の動きについてくる
  const shine = useTransform(x, [-200, 200], ['80%', '20%']);
  const tilt = useTransform(x, [-240, 240], [-2.2, 2.2]);

  useEffect(() => {
    const w = cardRef.current?.offsetWidth ?? 360;
    threshold.current = Math.min(120, w * 0.3);
  }, []);

  useMotionValueEvent(x, 'change', (v) => {
    const t = threshold.current;
    const a: 0 | 1 | -1 = v > t ? 1 : v < -t && prev ? -1 : 0;
    if (a !== armedRef.current) {
      armedRef.current = a;
      setArmed(a);
      if (a) navigator.vibrate?.(8);
    }
  });

  // はじめての人に、横に動かせることを一度だけ見せる
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => {
      animate(x, [0, 44, 0], { duration: 1.1, ease: [0.34, 0.01, 0.2, 1], times: [0, 0.45, 1] });
    }, 900);
    return () => clearTimeout(id);
  }, [hint, x]);

  // 左の丸の上から払い始めても動かす（丸のタップとは、動いたかどうかで分ける）
  function onPointerDown(e: PointerEvent) {
    if (editing) return;
    dragged.current = false;
    down.current = { x: e.clientX, y: e.clientY };
    controls.start(e);
  }

  // 払った指を離したときの click は、タップとして扱わない。
  // Motion の onDragStart は次のコマまで遅れることがあるので、指の移動距離でも確かめる
  function wasDrag(e: MouseEvent) {
    if (e.detail === 0) return false; // キーボードで押したとき
    return dragged.current || Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 8;
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    const target = dir > 0 ? next : prev;
    const fast = Math.abs(vx) > 650 && Math.abs(dx) > 36 && Math.sign(vx) === dir;
    if (target && (Math.abs(dx) > threshold.current || fast)) {
      navigator.vibrate?.(14);
      onFlick(task, target, dir);
    }
    animate(x, 0, SPRING);
  }

  const variants: Variants = {
    hidden: { opacity: 0, y: -14, scale: 0.96, filter: 'blur(8px)' },
    shown: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: { ...SPRING, delay: stagger ? Math.min(index, 10) * 0.045 : 0 },
    },
    gone: () => {
      const d = exitDir.get(task.id) ?? 0;
      exitDir.delete(task.id);
      return d
        ? { x: d * 520, opacity: 0, rotate: d * 4, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const } }
        : { opacity: 0, scale: 0.92, filter: 'blur(8px)', transition: { duration: 0.22 } };
    },
  };

  return (
    <motion.li
      layout
      data-id={task.id}
      data-status={task.status}
      className={`task-row${editing ? ' is-editing' : ''}`}
      variants={variants}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <div className={`reveal reveal-right tone-${right.tone}`} aria-hidden="true">
        <motion.span className="reveal-inner" style={{ opacity: rightOpacity }}>
          <motion.span className={`reveal-icon${armed === 1 ? ' armed' : ''}`} style={{ scale: rightIcon }}>
            <right.Icon />
          </motion.span>
          <span className="reveal-label">{right.label}</span>
        </motion.span>
      </div>
      {prev && (
        <div className={`reveal reveal-left tone-${left.tone}`} aria-hidden="true">
          <motion.span className="reveal-inner" style={{ opacity: leftOpacity }}>
            <span className="reveal-label">{left.label}</span>
            <motion.span className={`reveal-icon${armed === -1 ? ' armed' : ''}`} style={{ scale: leftIcon }}>
              <left.Icon />
            </motion.span>
          </motion.span>
        </div>
      )}

      <motion.div
        ref={cardRef}
        className={`card glass status-${task.status}`}
        data-testid="task"
        drag={editing ? false : 'x'}
        dragControls={controls}
        dragListener={false}
        dragDirectionLock
        dragMomentum={false}
        dragElastic={0.14}
        dragConstraints={{ left: prev ? -1200 : 0, right: 1200 }}
        onPointerDown={onPointerDown}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onClick={(e) => {
          if (editing || wasDrag(e) || (e.target as Element).closest('button')) return;
          onEdit(task.id);
        }}
        whileTap={editing ? undefined : { scale: 0.985 }}
        style={{ x, rotate: tilt, ['--shine-x' as string]: shine, touchAction: 'pan-y' }}
      >
        <button
          type="button"
          className="mark-btn"
          aria-label={`${LABEL[task.status]}。押すと${LABEL[CYCLE[task.status]]}にする`}
          onClick={(e) => {
            if (!wasDrag(e)) onFlick(task, CYCLE[task.status], 1);
          }}
        >
          <StatusMark status={task.status} />
        </button>
        {editing ? (
          <Editor task={task} onDone={() => onEdit(null)} onRename={onRename} onFlick={onFlick} />
        ) : (
          <p className="title">{task.title}</p>
        )}
      </motion.div>
    </motion.li>
  );
}

function Editor({
  task,
  onDone,
  onRename,
  onFlick,
}: {
  task: Task;
  onDone(): void;
  onRename(task: Task, title: string): void;
  onFlick(task: Task, target: Target, dir: 1 | -1): void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    grow(el);
  }, []);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.currentTarget.value = task.title;
      onDone();
    } else if (e.key === 'Enter' && !e.shiftKey && !composing.current && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      onRename(task, e.currentTarget.value);
      onDone();
    }
  }

  return (
    <motion.div
      className="editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <textarea
        ref={ref}
        defaultValue={task.title}
        aria-label="タスクの内容"
        enterKeyHint="done"
        rows={1}
        maxLength={500}
        onInput={(e) => grow(e.currentTarget)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onKeyDown={onKeyDown}
        onBlur={(e) => onRename(task, e.currentTarget.value)}
      />
      <motion.div
        className="editor-actions"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, ...SPRING }}
      >
        {(['todo', 'doing', 'done'] as Status[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip tone-${s}${task.status === s ? ' is-on' : ''}`}
            aria-pressed={task.status === s}
            onClick={() => {
              if (s !== task.status) onFlick(task, s, s === 'todo' || (s === 'doing' && task.status === 'done') ? -1 : 1);
              onDone();
            }}
          >
            {LABEL[s]}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-danger"
          aria-label="削除"
          onClick={() => {
            onFlick(task, 'delete', 1);
            onDone();
          }}
        >
          <TrashIcon />
        </button>
      </motion.div>
    </motion.div>
  );
}
