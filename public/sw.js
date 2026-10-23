// 2回目からは、通信を待たずに手元の画面を出す（開いた瞬間にメモできるように）。
// 画面（HTML）は手元のものをすぐ出しつつ裏で新しくし、ファイル名にハッシュが付いた /assets/ は一度取ったら使い続ける。
const CACHE = 'flick-v1';
const SHELL = ['/', '/boot.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 今の画面と一つ前の画面が使う /assets/ だけを残し、古いものは消す
async function prune(cache, html) {
  const keep = new Set(html.match(/\/assets\/[^"' )]+/g) || []);
  const prev = await cache.match('/__prev-assets');
  if (prev) (await prev.json()).forEach((p) => keep.add(p));
  await cache.put('/__prev-assets', new Response(JSON.stringify([...(html.match(/\/assets\/[^"' )]+/g) || [])])));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(req);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // アプリ以外のページ（プライバシーポリシーなど）は、まず通信で取りにいく
  if (req.mode === 'navigate' && url.pathname !== '/') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match('/');
        const fresh = fetch(req)
          .then(async (res) => {
            if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
              await cache.put('/', res.clone());
              prune(cache, await res.clone().text());
            }
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        return fresh;
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // それ以外（boot.js やアイコン）は、手元を出しつつ裏で新しくする
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) {
        event.waitUntil(fresh);
        return hit;
      }
      return fresh;
    }),
  );
});
