import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface ToastData {
  id: number;
  text: string;
  undo?: () => void;
}

const LIFE = 4500;
const SPRING = { type: 'spring', stiffness: 460, damping: 32 } as const;

/**
 * 通知は一つだけ。続けて操作したときは、同じガラスの粒が幅を変えながら中身だけ入れ替わる
 * （古い通知の「元に戻す」を押し間違えないように）
 */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose(): void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onClose, LIFE);
    return () => clearTimeout(id);
  }, [toast, onClose]);

  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            layout
            className="toast glass"
            role="status"
            data-testid="toast"
            initial={{ y: 40, opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: 24, opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
            transition={SPRING}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.8 }}
            onDragEnd={(_, i) => i.offset.y > 30 && onClose()}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={toast.id}
                layout="position"
                className="toast-text"
                initial={{ y: 14, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -14, opacity: 0, filter: 'blur(4px)' }}
                transition={SPRING}
              >
                {toast.text}
              </motion.span>
            </AnimatePresence>
            {toast.undo && (
              <motion.button
                layout="position"
                type="button"
                className="toast-undo"
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  toast.undo?.();
                  onClose();
                }}
              >
                元に戻す
              </motion.button>
            )}
            <motion.span
              key={`bar-${toast.id}`}
              className="toast-bar"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: LIFE / 1000, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
