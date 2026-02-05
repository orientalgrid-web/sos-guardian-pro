// SafeRoute Service Worker v1.0
const CACHE_NAME = 'saferoute-v1.2';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Install Event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/browserconfig.xml'
      ]);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Network first, then cache for HTML
  if (request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE)
            .then((cache) => cache.put(request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              return cachedResponse || caches.match('/');
            });
        })
    );
    return;
  }
  
  // Cache first for other resources
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse.ok) return networkResponse;
            
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => cache.put(request, responseClone));
            return networkResponse;
          });
      })
  );
});

// Handle messages from app
self.addEventListener('message', (event) => {
  const { type } = event.data;
  
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
