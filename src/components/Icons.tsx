import { motion } from 'motion/react';
import type { Status } from '../../shared/types';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} strokeWidth={2.6} />
  </svg>
);

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M9 7L4.5 11.5 9 16" {...stroke} strokeWidth={2.4} />
    <path d="M5 11.5h9.5a5 5 0 010 10H12" {...stroke} strokeWidth={2.4} />
  </svg>
);

export const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1 1 .9 1.8 1.9 1.8h5.4c1 0 1.8-.8 1.9-1.8L17.5 7" {...stroke} />
  </svg>
);

export const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="12" cy="8.5" r="3.8" {...stroke} />
    <path d="M4.8 20c1-3.6 3.9-5.6 7.2-5.6s6.2 2 7.2 5.6" {...stroke} />
  </svg>
);

/** 左端の丸。未着手は空、進行中は半分、完了は塗りつぶしにチェック */
export function StatusMark({ status }: { status: Status }) {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true" className={`mark mark-${status}`}>
      <circle cx="14" cy="14" r="11" className="mark-ring" />
      <motion.circle
        cx="14"
        cy="14"
        r="5.5"
        className="mark-pie"
        initial={false}
        animate={{ pathLength: status === 'doing' ? 0.5 : 0, opacity: status === 'doing' ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        style={{ rotate: -90 }}
      />
      <motion.circle
        cx="14"
        cy="14"
        r="11"
        className="mark-fill"
        initial={false}
        animate={{ scale: status === 'done' ? 1 : 0.4, opacity: status === 'done' ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      />
      <motion.path
        d="M8.8 14.4l3.4 3.4 7-7.4"
        className="mark-check"
        initial={false}
        animate={{ pathLength: status === 'done' ? 1 : 0, opacity: status === 'done' ? 1 : 0 }}
        transition={{ duration: 0.32, ease: [0.3, 0.7, 0.2, 1], delay: status === 'done' ? 0.08 : 0 }}
      />
    </svg>
  );
}
