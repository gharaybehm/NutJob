// NutJob Service Worker
// Strategy:
//   /_next/static/ + public images  → cache-first  (safe: content-hashed)
//   /dashboard, /blocks, /calendar  → network-first (fresh data, offline fallback)
//   Everything else                 → network-only

const STATIC_CACHE = 'nutjob-static-v1';
const PAGE_CACHE   = 'nutjob-pages-v1';
const ALL_CACHES   = [STATIC_CACHE, PAGE_CACHE];

const OFFLINE_PAGES = ['/dashboard', '/blocks', '/calendar'];

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip Next.js RSC navigation payloads — letting these through untouched
  // prevents breaking client-side routing when a cached HTML shell is returned
  if (request.headers.get('Rsc') === '1') return;
  if (request.headers.get('Next-Router-Prefetch') === '1') return;

  // Skip HMR websocket upgrade
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // 1. Next.js static chunks (content-hashed filenames) → cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // 2. Public images and fonts → cache-first
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // 3. Key dashboard pages (HTML only) → network-first with offline fallback
  const isHtml = request.headers.get('accept')?.includes('text/html');
  const isKeyPage = OFFLINE_PAGES.some(
    (p) => url.pathname === p || url.pathname.startsWith(p + '/')
  );

  if (isHtml && isKeyPage) {
    event.respondWith(networkFirst(PAGE_CACHE, request));
    return;
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offline — NutJob</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100dvh; margin: 0; background: #f8fafc; color: #334155; text-align: center; padding: 2rem; }
    h1  { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    p   { color: #64748b; margin-bottom: 1.5rem; }
    a   { display: inline-block; background: #16a34a; color: #fff; padding: 0.6rem 1.4rem;
          border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div>
    <h1>You&#8217;re offline</h1>
    <p>This page hasn&#8217;t been cached yet.<br/>Visit it once while online and it will work offline.</p>
    <a href="/dashboard">Go to Dashboard</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
