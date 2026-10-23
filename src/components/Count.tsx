import { AnimatePresence, motion } from 'motion/react';

/** 数字が変わると、古い数字が上へ抜けて新しい数字が下から入る */
export function Count({ n, className = 'count' }: { n: number; className?: string }) {
  return (
    <span className={className} aria-label={`${n}件`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={n}
          initial={{ y: 9, opacity: 0, filter: 'blur(3px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -9, opacity: 0, filter: 'blur(3px)' }}
          transition={{ type: 'spring', stiffness: 600, damping: 34 }}
          aria-hidden="true"
        >
          {n}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
