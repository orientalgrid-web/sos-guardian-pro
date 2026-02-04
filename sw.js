// Service Worker for SafeRoute App
const CACHE_NAME = 'saferoute-v1';
const urlsToCache = [
  '/sos-guardian-pro/',
  '/sos-guardian-pro/index.html',
  '/sos-guardian-pro/manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activated');
});

// Fetch Strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
