const CACHE_VERSION = 'v5';
const APP_CACHE = `japan2027-app-${CACHE_VERSION}`;
const DATA_CACHE = `japan2027-data-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/parser.js',
  './js/store.js',
  './js/photos.js',
  './js/sheet-sync.js',
  './js/app.js',
  './data/seed.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== APP_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Sheet data: network-first, falling back to the last successful response
  // so the itinerary still loads offline.
  if (url.hostname === 'docs.google.com') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: cache-first, so the app itself always opens instantly offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
