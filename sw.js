// Service worker: ускоряет запуск и даёт офлайн-оболочку.
// ВАЖНО: при обновлении файлов меняйте версию кэша, чтобы клиенты подтянули новое.
const CACHE = 'food-pwa-v1';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Запросы к бэкенду (Google Apps Script) — всегда из сети, не кэшируем
  if (url.indexOf('script.google.com') > -1 || e.request.method !== 'GET') return;

  // Оболочка: сначала кэш, потом сеть (мгновенный старт). Картинки/прочее — сеть с откатом в кэш.
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetchPromise = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
