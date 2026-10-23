import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { deleteAccount, logout, useStore } from '../lib/store';
import { PersonIcon } from './Icons';

/** 右上の丸。静的な HTML の枠（#account-slot）に差し込む */
export function Account({ onLoginWanted }: { onLoginWanted(): void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const auth = useStore((s) => s.auth);
  const user = useStore((s) => s.user);

  useLayoutEffect(() => {
    const el = document.getElementById('account-slot');
    if (el) {
      el.replaceChildren();
      setSlot(el);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.account')) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!slot) return null;

  return createPortal(
    <div className="account">
      <AnimatePresence mode="popLayout" initial={false}>
        {auth === 'unknown' ? (
          <motion.span key="sk" className="sk sk-avatar" exit={{ opacity: 0, scale: 0.8 }} />
        ) : (
          <motion.button
            key={auth}
            type="button"
            className="avatar glass"
            data-testid="account"
            aria-label={auth === 'in' ? 'アカウント' : 'ログイン'}
            aria-expanded={open}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            onClick={() => (auth === 'in' ? setOpen((o) => !o) : onLoginWanted())}
          >
            {auth === 'in' && user?.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" />
            ) : auth === 'in' && user ? (
              <span className="initial">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
            ) : (
              <PersonIcon />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && user && (
          <motion.div
            className="menu glass"
            role="dialog"
            aria-label="アカウント"
            initial={{ opacity: 0, scale: 0.85, y: -8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9, y: -6, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            style={{ transformOrigin: 'top right' }}
          >
            <div className="menu-who">
              {user.name && <strong>{user.name}</strong>}
              <span>{user.email}</span>
            </div>
            <motion.button
              type="button"
              className="menu-item"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              ログアウト
            </motion.button>
            {/* 削除は 2 回押して確定する。1 回目でボタンが赤く広がり、確認の文に変わる */}
            <motion.button
              layout
              type="button"
              className={`menu-item menu-danger${confirming ? ' is-confirming' : ''}`}
              whileTap={{ scale: 0.96 }}
              disabled={deleting}
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setDeleting(true);
                try {
                  await deleteAccount();
                  setOpen(false);
                } catch {
                  setDeleting(false);
                }
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={confirming ? 'sure' : 'ask'}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  {confirming ? 'すべて消します。よろしいですか' : 'アカウントを削除'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <a className="menu-link" href="/privacy">
              プライバシーポリシー
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    slot,
  );
}
