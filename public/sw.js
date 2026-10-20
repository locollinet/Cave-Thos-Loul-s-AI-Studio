/* Loul's & Thos — service worker : coque applicative hors ligne.
 * Incrémenter VERSION à chaque modification de ce fichier (les anciens caches sont purgés à l'activation).
 * Jamais mis en cache : /api/* (IA, serveur), Firestore, Firebase Auth et tout autre domaine googleapis
 * (les données hors ligne relèvent du cache persistant Firestore, pas de ce SW). */
const VERSION = 'v1';
const SHELL = `lt-shell-${VERSION}`;
const ASSETS = `lt-assets-${VERSION}`;
const FONTS = `lt-fonts-${VERSION}`;
const KEEP = [SHELL, ASSETS, FONTS];
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/brand/monogram.svg', '/icons/icon-192.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_ASSETS = 250;
const NAV_TIMEOUT_MS = 6000;
// Fichiers hachés Vite référencés par un chunk (carte des imports dynamiques, `import("./x-hash.js")`).
const CHUNK_REF = /(?:assets\/|\.\/)([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(?:js|css))/g;
const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');

/** Stratégie applicable à une requête, ou null (le navigateur la traite sans le SW). */
function route(request) {
  if (request.method !== 'GET') return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin === self.location.origin) {
    const p = url.pathname;
    if (p === '/api' || p.startsWith('/api/') || p.startsWith('/__/') || p === '/sw.js') return null;
    if (request.mode === 'navigate') return 'navigate';
    if (p.startsWith('/assets/')) return 'asset';
    if (p.startsWith('/icons/') || p.startsWith('/brand/') || p === '/manifest.webmanifest') return 'static';
    return null;
  }
  if (url.protocol === 'https:' && FONT_HOSTS.includes(url.hostname)) return 'font';
  return null;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Le serveur SPA répond index.html (200) pour un fichier absent : ne jamais le stocker comme script.
  if (res.ok && !isHtml(res)) {
    await cache.put(request, res.clone());
    trim(cache, MAX_ASSETS);
  }
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const network = fetch(event.request)
    .then(async (res) => {
      if (res.ok || res.type === 'opaque') await cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

const offlinePage = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Loul\'s &amp; Thos</title><body style="font-family:Georgia,serif;background:#f7f4ef;color:#6b1f2e;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><p>Hors ligne — reconnectez-vous pour ouvrir Loul\'s &amp; Thos.<br><small>Offline — reconnect to open the app.</small></p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL);
  const network = fetch(request).then(async (res) => {
    // Le serveur renvoie la même coque SPA pour toutes les routes : on garde la dernière reçue.
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) await cache.put('/index.html', res.clone());
    return res;
  });
  network.catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    /* hors ligne */
  }
  const cached = (await cache.match('/index.html')) || (await cache.match('/'));
  if (cached) return cached;
  try {
    return await network;
  } catch {
    return offlinePage();
  }
}

/** Met en cache des URL déjà chargées par la page (1re visite, avant la prise de contrôle). */
async function warm(urls) {
  for (const u of urls || []) {
    if (typeof u !== 'string') continue;
    const font = /^https:\/\/fonts\.googleapis\.com\//.test(u);
    const req = new Request(u, { mode: font ? 'no-cors' : 'cors', credentials: 'omit' });
    const kind = route(req);
    if (kind !== 'asset' && kind !== 'font' && kind !== 'static') continue;
    const cache = await caches.open(kind === 'asset' ? ASSETS : kind === 'font' ? FONTS : SHELL);
    if (await cache.match(req)) continue;
    try {
      const res = await fetch(req);
      if ((res.ok && !isHtml(res)) || res.type === 'opaque') await cache.put(req, res);
    } catch {
      /* ignoré */
    }
  }
  await precacheChunks();
}

/** Met en cache, en tâche de fond, tous les chunks de l'application (routes paresseuses, lecteur ZXing…)
 * pour que chaque écran du déploiement courant s'ouvre hors ligne, même jamais visité. Une fois par build. */
async function precacheChunks() {
  const shell = await caches.open(SHELL);
  const html = await (await shell.match('/index.html'))?.text();
  const queue = [...(html || '').matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (!queue.length) return;
  const cache = await caches.open(ASSETS);
  const marker = `/__lt-precached__?${encodeURIComponent(queue.join(','))}`;
  if (await cache.match(marker)) return;
  const seen = new Set();
  while (queue.length && seen.size < MAX_ASSETS) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    let res = await cache.match(path);
    if (!res) {
      try {
        res = await fetch(path, { credentials: 'same-origin' });
      } catch {
        return; // hors ligne : on reprendra au prochain chargement
      }
      if (!res.ok || isHtml(res)) continue;
      await cache.put(path, res.clone());
    }
    if (path.endsWith('.js')) for (const m of (await res.text()).matchAll(CHUNK_REF)) queue.push(`/assets/${m[1]}`);
  }
  await cache.put(marker, new Response('1'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(SHELL_URLS);
      // Pré-cache des scripts/styles d'entrée référencés par la coque, sinon le 1er démarrage hors ligne est blanc.
      const html = await (await cache.match('/index.html'))?.text();
      const entry = [...(html || '').matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      if (entry.length) await (await caches.open(ASSETS)).addAll(entry).catch(() => undefined);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('lt-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'CACHE_URLS') event.waitUntil(warm(data.urls));
});

self.addEventListener('fetch', (event) => {
  const kind = route(event.request);
  if (!kind) return;
  if (kind === 'navigate') event.respondWith(networkFirstNavigation(event.request));
  else if (kind === 'asset') event.respondWith(cacheFirst(event.request));
  else if (kind === 'font') event.respondWith(staleWhileRevalidate(event, FONTS));
  else event.respondWith(staleWhileRevalidate(event, SHELL));
});
