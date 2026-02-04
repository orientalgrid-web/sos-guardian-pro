// Service Worker for SafeRoute App
const CACHE_NAME = 'saferoute-v1';
const urlsToCache = [
  '/sos-guardian-pro/',
  '/sos-guardian-pro/index.html',
  '/sos-guardian-pro/manifest.json',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Strategy: Cache First, then Network
self.addEventListener('fetch', event => {
  // Skip Mapbox API calls
  if (event.request.url.includes('mapbox.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Handle Push Notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.text() : 'New alert from SafeRoute';
  
  const options = {
    body: data,
    icon: '/sos-guardian-pro/icon-192.png',
    badge: '/sos-guardian-pro/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/sos-guardian-pro/'
    }
  };

  event.waitUntil(
    self.registration.showNotification('SafeRoute Alert', options)
  );
});

// Handle Notification Click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === '/sos-guardian-pro/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/sos-guardian-pro/');
      }
    })
  );
});
