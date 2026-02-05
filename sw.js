// SafeRoute Service Worker v1.0
const CACHE_NAME = 'saferoute-v1.2';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';
const EMERGENCY_CACHE = 'emergency-data';

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
        '/icons/icon-72x72.png',
        '/icons/icon-96x96.png',
        '/icons/icon-128x128.png',
        '/icons/icon-144x144.png',
        '/icons/icon-152x152.png',
        '/icons/icon-192x192.png',
        '/icons/icon-384x384.png',
        '/icons/icon-512x512.png',
        '/icons/maskable-icon.png'
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
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== EMERGENCY_CACHE) {
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

// Fetch Event - Cache First, then Network Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle different resource types
  if (request.headers.get('Accept').includes('text/html')) {
    // For HTML: Network first, fallback to cache
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache the fresh response
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
  } else if (request.url.includes('api.mapbox.com')) {
    // For Mapbox: Cache first, then network
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(request)
            .then((networkResponse) => {
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE)
                .then((cache) => cache.put(request, responseClone));
              return networkResponse;
            })
            .catch(() => {
              // Return offline fallback
              return new Response(JSON.stringify({
                offline: true,
                message: 'Map service unavailable offline'
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
    );
  } else {
    // For other resources: Cache first
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(request)
            .then((networkResponse) => {
              // Only cache successful responses
              if (!networkResponse.ok) return networkResponse;
              
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE)
                .then((cache) => cache.put(request, responseClone));
              return networkResponse;
            });
        })
    );
  }
});

// Background Sync for Emergency Alerts
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-emergencies') {
    console.log('[Service Worker] Background sync for emergencies');
    event.waitUntil(syncEmergencies());
  }
});

// Sync emergency data when online
async function syncEmergencies() {
  try {
    const emergencyCache = await caches.open(EMERGENCY_CACHE);
    const keys = await emergencyCache.keys();
    
    for (const request of keys) {
      const response = await emergencyCache.match(request);
      if (!response) continue;
      
      const emergencyData = await response.json();
      
      // Try to send to server
      try {
        const sent = await sendEmergencyData(emergencyData);
        if (sent) {
          await emergencyCache.delete(request);
          console.log('[Service Worker] Emergency synced successfully');
          
          // Send notification to app
          sendMessageToClients({
            type: 'EMERGENCY_SYNC_SUCCESS',
            data: emergencyData
          });
        }
      } catch (error) {
        console.error('[Service Worker] Failed to sync emergency:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Sync error:', error);
  }
}

// Send emergency data to server
async function sendEmergencyData(data) {
  // Replace with your actual API endpoint
  const API_URL = 'https://api.saferoute.ng/emergency';
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        app_version: '1.0.0'
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('[Service Worker] API Error:', error);
    throw error;
  }
}

// Handle messages from app
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'STORE_EMERGENCY':
      storeEmergencyData(data);
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_CACHED_DATA':
      getCachedData(event);
      break;
  }
});

// Store emergency data offline
async function storeEmergencyData(data) {
  try {
    const cache = await caches.open(EMERGENCY_CACHE);
    const id = Date.now().toString();
    const url = `/emergency/${id}`;
    
    await cache.put(
      new Request(url),
      new Response(JSON.stringify({
        ...data,
        stored_at: new Date().toISOString(),
        sync_attempts: 0
      }))
    );
    
    // Register for background sync
    if ('SyncManager' in self.registration) {
      try {
        await self.registration.sync.register('sync-emergencies');
      } catch (syncError) {
        console.log('[Service Worker] Background sync not available');
      }
    }
    
    // Notify clients
    sendMessageToClients({
      type: 'EMERGENCY_STORED',
      id: id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Service Worker] Store emergency error:', error);
  }
}

// Push Notifications
self.addEventListener('push', (event) => {
  let data = {};
  
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'SafeRoute',
      body: 'Emergency notification',
      icon: '/icons/icon-192x192.png'
    };
  }
  
  const options = {
    body: data.body || 'Emergency alert',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
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
  
  event.waitUntil(self.registration.showNotification(data.title || 'SafeRoute', options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/?emergency=true')
    );
  }
});

// Helper function to send messages to clients
function sendMessageToClients(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// Helper to get cached data
async function getCachedData(event) {
  const { cacheName, key } = event.data;
  
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(key);
    
    if (response) {
      const data = await response.json();
      event.ports[0].postMessage({ success: true, data });
    } else {
      event.ports[0].postMessage({ success: false, error: 'Not found' });
    }
  } catch (error) {
    event.ports[0].postMessage({ success: false, error: error.message });
  }
}

// Periodic Sync (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'periodic-emergency-sync') {
      event.waitUntil(syncEmergencies());
    }
  });
}
