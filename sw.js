// Service Worker：アプリのファイルを端末に保存して、電波の弱い畑でもすぐ開けるようにする
// 表示はキャッシュから即座に返し、裏で最新版を取りに行く（次回起動時に反映）。
// ファイルを追加したら ASSETS に足し、公開時は CACHE の番号を上げる。

const CACHE = 'garden-app-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/utils.js',
  'js/stamps.js',
  'js/photo.js',
  'js/backup.js',
  'js/views/crop-list.js',
  'js/views/crop-detail.js',
  'js/views/crop-form.js',
  'js/views/record-form.js',
  'js/views/settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const network = fetch(req).then(async (res) => {
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || network),
  );
});
