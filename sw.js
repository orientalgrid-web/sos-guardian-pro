// Service Worker for SafeRoute PWA
const CACHE_NAME = 'saferoute-v1.3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css'
];

// Install event
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache First, Network Fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          console.log('[SW] Serving from cache:', event.request.url);
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        // Try network
        return fetch(fetchRequest)
          .then(response => {
            // Check if valid response
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
            console.log('[SW] Fetch failed:', error);
            
            // For HTML pages, return offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // Return offline image for images
            if (event.request.headers.get('accept').includes('image')) {
              return new Response(
                '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0A192F"/><text x="50%" y="50%" font-family="Arial" font-size="20" fill="#8892B0" text-anchor="middle" dy=".3em">Image not available offline</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            
            // Generic offline response
            return new Response('Offline - Content not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});

// Background sync for emergency messages
self.addEventListener('sync', event => {
  if (event.tag === 'emergency-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncEmergencyMessages());
  }
});

async function syncEmergencyMessages() {
  try {
    const db = await openDatabase();
    const messages = await getAllMessages(db);
    
    for (const message of messages) {
      // Simulate sending message
      console.log('[SW] Sending queued message:', message);
      await deleteMessage(db, message.id);
    }
    
    console.log('[SW] Emergency messages synced successfully');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'SafeRoute Alert', body: event.data.text() };
    }
  }
  
  const title = data.title || 'SafeRoute Alert';
  const options = {
    body: data.body || 'Emergency alert from SafeRoute',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [200, 100, 200, 100, 200],
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

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view' || event.action === '') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes('./index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow('./index.html');
        }
      })
    );
  }
});

// Database functions for offline storage
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SafeRouteDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('locations')) {
        const store = db.createObjectStore('locations', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteMessage(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Handle messages from main thread
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'CACHE_DATA') {
    // Cache additional resources
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(event.data.urls);
    });
  } else if (event.data.type === 'GET_CACHED_DATA') {
    // Get cached data
    caches.match(event.data.url).then(response => {
      event.ports[0].postMessage(response);
    });
  }
});
