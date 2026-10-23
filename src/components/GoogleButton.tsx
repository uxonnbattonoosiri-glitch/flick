import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { renderGoogleButton } from '../lib/google';

/** Google が用意したボタンを、ガラスの台の上に出す。出せないときは押せない代わりのボタン */
export function GoogleButton() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'off'>('loading');

  useEffect(() => {
    let alive = true;
    if (!ref.current) return;
    renderGoogleButton(ref.current)
      .then((ok) => alive && setState(ok ? 'ready' : 'off'))
      .catch(() => alive && setState('off'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="gbtn-wrap" data-state={state}>
      <div ref={ref} className="gbtn" data-testid="google-button" />
      {state !== 'ready' && (
        <motion.button
          type="button"
          className={`gbtn-fallback${state === 'loading' ? ' sk' : ''}`}
          disabled
          aria-disabled="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {state === 'off' && (
            <>
              <GoogleG />
              <span>Google でログイン</span>
            </>
          )}
        </motion.button>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
