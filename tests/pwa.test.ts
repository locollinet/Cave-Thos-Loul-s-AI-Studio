import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pwa } from '@/i18n/pwa';
import { isGuestPage } from '@/lib/pwa';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const pub = (src: string) => path.join(root, 'public', src.replace(/^\//, ''));
const pngSize = (file: string) => {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Icon[];
  shortcuts?: { url: string }[];
};

describe('web app manifest', () => {
  it('declares the required installability fields', () => {
    expect(manifest.name).toBe("Loul's & Thos");
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(15);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('uses the app ivory / burgundy palette', () => {
    const css = read('src/index.css');
    const v = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1].toLowerCase();
    expect(manifest.background_color).toBe(v('bg'));
    expect(manifest.theme_color).toBe(v('brand'));
    expect(read('index.html')).toContain(`name="theme-color" content="${manifest.theme_color}"`);
  });

  it('ships SVG, 192/512 PNG and maskable icons that exist on disk with the declared size', () => {
    const icons = manifest.icons;
    expect(icons.some((i) => i.type === 'image/svg+xml')).toBe(true);
    for (const size of ['192x192', '512x512']) {
      expect(icons.some((i) => i.sizes === size && i.type === 'image/png' && (i.purpose ?? 'any').includes('any'))).toBe(true);
      expect(icons.some((i) => i.sizes === size && i.purpose === 'maskable')).toBe(true);
    }
    for (const i of icons) {
      expect(fs.existsSync(pub(i.src)), i.src).toBe(true);
      if (i.type === 'image/png') expect(pngSize(pub(i.src)), i.src).toBe(i.sizes);
    }
    for (const s of manifest.shortcuts ?? []) expect(s.url.startsWith('/')).toBe(true);
  });

  it('is linked from index.html with apple-touch-icon and favicon', () => {
    const html = read('index.html');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('href="/brand/monogram.svg"');
    expect(html).toMatch(/fonts\.googleapis\.com\/css2?\?family=/);
    const apple = html.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1];
    expect(apple).toBeTruthy();
    expect(pngSize(pub(apple!))).toBe('180x180');
  });
});

/* ---- service worker exécuté dans un bac à sable minimal ---- */

type Handler = (e: unknown) => void;
function loadSw(impl?: (url: string) => Response) {
  const handlers: Record<string, Handler> = {};
  const fetchMock = vi.fn(async (r: Request | string) => impl?.(typeof r === 'string' ? r : r.url) ?? new Response('x', { status: 200, headers: { 'content-type': 'text/html' } }));
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (r: Request | string) => store.get(typeof r === 'string' ? r : r.url)?.clone()),
    put: vi.fn(async (r: Request | string, res: Response) => void store.set(typeof r === 'string' ? r : r.url, res)),
    addAll: vi.fn(async (_urls: string[]) => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['lt-shell-v0', 'other-app']), delete: vi.fn(async () => true) };
  const self = {
    location: new URL('https://app.test/sw.js'),
    addEventListener: (type: string, h: Handler) => (handlers[type] = h),
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
  };
  new Function('self', 'caches', 'fetch', read('public/sw.js'))(self, caches, fetchMock);
  const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) => {
    const respondWith = vi.fn((p: Promise<Response>) => p.catch(() => undefined));
    handlers.fetch({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith, waitUntil: vi.fn() });
    return respondWith;
  };
  return { handlers, fetchEvent, fetchMock, caches, cache, self };
}

describe('service worker', () => {
  it('never intercepts /api, Firestore or Google auth traffic', () => {
    const { fetchEvent } = loadSw();
    const bypass = [
      ['https://app.test/api/ai/label', {}],
      ['https://app.test/api/health', { mode: 'navigate' }],
      ['https://app.test/api', {}],
      ['https://app.test/api/ai', { method: 'POST' }],
      ['https://app.test/__/auth/handler', { mode: 'navigate' }],
      ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?x=1', {}],
      ['https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST' }],
      ['https://securetoken.googleapis.com/v1/token', {}],
      ['https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig', {}],
      ['https://apis.google.com/js/api.js', {}],
      ['https://app.test/assets/index.js', { method: 'POST' }],
      ['https://app.test/sw.js', {}],
    ] as const;
    for (const [url, init] of bypass) expect(fetchEvent(url, init), url).not.toHaveBeenCalled();
  });

  it('serves the shell, hashed assets, icons and Google Fonts', () => {
    const { fetchEvent } = loadSw();
    for (const [url, init] of [
      ['https://app.test/', { mode: 'navigate' }],
      ['https://app.test/inventaire', { mode: 'navigate' }],
      ['https://app.test/assets/index-AbC123.js', {}],
      ['https://app.test/icons/icon-192.png', {}],
      ['https://app.test/manifest.webmanifest', {}],
      ['https://fonts.googleapis.com/css2?family=Inter', { mode: 'no-cors' }],
      ['https://fonts.googleapis.com/css?family=Cormorant+Garamond:400,400i', { mode: 'no-cors' }],
      ['https://fonts.gstatic.com/s/inter/v1/x.woff2', {}],
    ] as const)
      expect(fetchEvent(url, init), url).toHaveBeenCalledOnce();
  });

  it('falls back to the cached index.html when a navigation fails offline', async () => {
    const { fetchEvent, fetchMock, cache } = loadSw();
    const shell = new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } });
    await cache.put('/index.html', shell);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const respondWith = fetchEvent('https://app.test/stock', { mode: 'navigate' });
    const res = await (respondWith.mock.calls[0][0] as Promise<Response>);
    expect(await res.text()).toContain('id="root"');
  });

  it('precaches the shell without /api and purges only its own outdated caches', async () => {
    const { handlers, caches, cache } = loadSw();
    let pending: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    const urls = cache.addAll.mock.calls[0][0];
    expect(urls).toEqual(expect.arrayContaining(['/', '/index.html']));
    expect(urls.some((u) => u.startsWith('/api'))).toBe(false);
    handlers.activate({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    expect(caches.delete).toHaveBeenCalledWith('lt-shell-v0');
    expect(caches.delete).not.toHaveBeenCalledWith('other-app');
  });

  it('ignores /api and foreign URLs when warming the cache', async () => {
    const { handlers, fetchMock } = loadSw();
    let pending: Promise<unknown> = Promise.resolve();
    handlers.message({ data: { type: 'CACHE_URLS', urls: ['https://app.test/api/health', 'https://firestore.googleapis.com/x', 'https://app.test/assets/a-1.js'] }, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    const fetched = fetchMock.mock.calls.map((c) => (c[0] as Request).url);
    expect(fetched).toEqual(['https://app.test/assets/a-1.js']);
  });

  it('precaches every lazy chunk of the build once, never an HTML fallback', async () => {
    const js = (body: string) => new Response(body, { headers: { 'content-type': 'application/javascript' } });
    const files: Record<string, () => Response> = {
      '/assets/index-AAAAAAAA.js': () => js('m.f=["assets/Wines-BBBBBBBB.js","assets/Stock-CCCCCCCC.css"]'),
      '/assets/Wines-BBBBBBBB.js': () => js('import("./zxing-DDDDDDDD.js")'),
      '/assets/zxing-DDDDDDDD.js': () => js('decode()'),
      '/assets/Stock-CCCCCCCC.css': () => new Response('a{}', { headers: { 'content-type': 'text/css' } }),
    };
    const { handlers, fetchMock, cache } = loadSw((u) => files[u]?.() ?? new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await cache.put('/index.html', new Response('<script src="/assets/index-AAAAAAAA.js"></script><script src="/assets/gone-EEEEEEEE.js"></script>'));
    const run = async () => {
      let pending: Promise<unknown> = Promise.resolve();
      handlers.message({ data: { type: 'CACHE_URLS', urls: [] }, waitUntil: (p: Promise<unknown>) => (pending = p) });
      await pending;
    };
    await run();
    const stored = cache.put.mock.calls.map((c) => String(c[0]));
    for (const f of Object.keys(files)) expect(stored, f).toContain(f);
    expect(stored).not.toContain('/assets/gone-EEEEEEEE.js');
    const calls = fetchMock.mock.calls.length;
    await run();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('activates a waiting worker only on request', () => {
    const { handlers, self } = loadSw();
    handlers.message({ data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() });
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('registration', () => {
  it('registers the service worker in production builds only', () => {
    expect(read('src/main.tsx')).toMatch(/if \(import\.meta\.env\.PROD\) registerServiceWorker\(\)/);
  });

  it('does not offer installation on guest pages', () => {
    expect(isGuestPage('/p/abc')).toBe(true);
    expect(isGuestPage('/o/abc')).toBe(true);
    expect(isGuestPage('/inventaire')).toBe(false);
    expect(isGuestPage('/')).toBe(false);
  });
});

describe('i18n', () => {
  it('has FR/EN parity for scanner & PWA strings', () => {
    expect(Object.keys(pwa.en).sort()).toEqual(Object.keys(pwa.fr).sort());
    for (const [k, v] of Object.entries(pwa.fr)) {
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(vars(pwa.en[k]), k).toEqual(vars(v));
    }
  });
});
