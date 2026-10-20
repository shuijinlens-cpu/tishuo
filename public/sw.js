/* 题说 · Service Worker
 *
 * 目标：第二次打开就能离线用（含 OCR 模型），并把应用"安装"到桌面。
 * 策略：
 *  - 应用外壳（html/js/css/图标）：stale-while-revalidate，先秒开再后台更新
 *  - OCR 模型 / wasm：cache-first（体积大、内容不变，绝不重复下载）
 *  - APK：不进缓存（几十 MB，且由浏览器直接下载）
 */

const VERSION = 'tishuo-v3';
const SHELL = `${VERSION}-shell`;
const MODELS = `${VERSION}-models`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './download.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isModel(url) {
  return /\/tessdata\/|\/tesseract\//.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\.apk$/i.test(url.pathname)) return; // APK 交给浏览器

  if (isModel(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODELS);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // 导航请求：网络优先，断了回落到缓存首页
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // 静态资源：先给缓存，同时后台更新
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit || (await network) || Response.error();
    })(),
  );
});
