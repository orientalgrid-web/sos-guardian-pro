// Service Worker for SafeRoute PWA
const CACHE_NAME = 'saferoute-v1.2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css'
];

// Install event - cache essential resources
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting on install');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // For API requests, try network first
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // For other resources, cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return response;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the new resource
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.log('[Service Worker] Fetch failed; returning offline page', error);
            
            // Return offline fallback for HTML pages
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./');
            }
            
            // Return generic error for other file types
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Background sync for emergency messages
self.addEventListener('sync', event => {
  if (event.tag === 'emergency-message') {
    console.log('[Service Worker] Background sync for emergency messages');
    event.waitUntil(syncEmergencyMessages());
  }
});

async function syncEmergencyMessages() {
  try {
    const messages = await getPendingMessages();
    for (const message of messages) {
      await sendEmergencyMessage(message);
      await removePendingMessage(message.id);
    }
    console.log('[Service Worker] Emergency messages synced successfully');
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

// Helper functions for background sync
async function getPendingMessages() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removePendingMessage(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SafeRouteDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Push notifications for emergency alerts
self.addEventListener('push', event => {
  console.log('[Service Worker] Push received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'SafeRoute Alert';
  const options = {
    body: data.body || 'Emergency alert from SafeRoute',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    tag: 'emergency-alert',
    data: data,
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'view') {
    // Open the app
    event.waitUntil(
      clients.matchAll({type: 'window'}).then(windowClients => {
        for (const client of windowClients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Periodic background sync for updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-check') {
    console.log('[Service Worker] Periodic sync for updates');
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/version.json', { cache: 'no-store' });
    const data = await response.json();
    
    if (data.version !== CACHE_NAME) {
      console.log('[Service Worker] Update available');
      self.registration.showNotification('SafeRoute Update', {
        body: 'A new version is available. Restart the app to update.',
        icon: '/icons/icon-192x192.png',
        tag: 'update-available'
      });
    }
  } catch (error) {
    console.log('[Service Worker] Update check failed:', error);
  }
}
