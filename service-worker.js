const CACHE_VERSION = 'v7';
const APP_CACHE = `japan2027-app-${CACHE_VERSION}`;
const DATA_CACHE = `japan2027-data-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
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
  './icons/logo-badge.png',
];

// iOS Safari refuses to let a service worker answer a request (especially a
// navigation) with a response that went through a redirect — e.g. Vercel's
// cleanUrls 308ing /index.html -> / — throwing "response served by service
// worker has redirections". Rebuild a fresh Response to drop that flag.
async function cleanRedirect(response) {
  if (!response || !response.redirected) return response;
  const body = await response.clone().blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) =>
            fetch(url)
              .then(cleanRedirect)
              .then((res) => cache.put(url, res))
          )
        )
      )
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
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then(cleanRedirect);
      })
    );
  }
});
