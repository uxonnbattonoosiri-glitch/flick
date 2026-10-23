import { api } from './api';

interface Gsi {
  accounts: {
    id: {
      initialize(opts: Record<string, unknown>): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gsi;
  }
}

let script: Promise<Gsi> | null = null;

function loadScript(): Promise<Gsi> {
  script ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('gsi')));
    s.onerror = () => {
      script = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return script;
}

/**
 * Google のログインボタンを描く。押すと Google の画面へ移り、
 * 終わると /api/auth/google に ID トークンが POST で戻ってくる（リダイレクト方式）。
 * 戻り値 false はボタンを出せなかった（設定がない・読み込めない）とき。
 */
export async function renderGoogleButton(el: HTMLElement): Promise<boolean> {
  const { googleClientId } = await api<{ googleClientId: string | null }>('/api/config');
  if (!googleClientId) return false;
  const [gsi, { nonce }] = await Promise.all([
    loadScript(),
    api<{ nonce: string }>('/api/auth/nonce', { method: 'POST' }),
  ]);
  gsi.accounts.id.initialize({
    client_id: googleClientId,
    ux_mode: 'redirect',
    login_uri: `${location.origin}/api/auth/google`,
    nonce,
    auto_select: false,
  });
  gsi.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    logo_alignment: 'left',
    locale: 'ja',
    width: Math.min(320, Math.max(220, el.clientWidth)),
  });
  return true;
}
