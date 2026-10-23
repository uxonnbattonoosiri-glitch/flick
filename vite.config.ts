import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  // 依存を最初にまとめて用意しておき、開発中の再最適化で止まらないようにする
  optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'motion/react'] },
});
