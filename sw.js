// Offline support: caches the app's own files so it opens with no internet.
// Bump VERSION whenever any app file changes, so phones pick up the update.
const VERSION = 'v1.3.0';
const CACHE = `sebssymptoms-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/report.css',
  './js/app.js',
  './js/ui.js',
  './js/db.js',
  './js/body.js',
  './js/images.js',
  './js/backup.js',
  './js/legacy-backup.js',
  './js/zip.js',
  './js/heat.js',
  './js/poem.js',
  './js/weather.js',
  './js/report.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache, so an update never mixes in stale old files.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sebssymptoms-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
      req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
