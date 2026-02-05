// Service Worker for SafeRoute Nigeria PWA
// Version: 3.0.0
const CACHE_NAME = 'saferoute-v3.0';
const OFFLINE_CACHE = 'saferoute-offline-v1';
const EMERGENCY_CACHE = 'saferoute-emergency-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js',
  'https://img.icons8.com/color/96/000000/shield.png',
  'https://img.icons8.com/color/192/000000/shield.png'
];

// Install Event - Cache static assets
self.addEventListener('install', event => {
  console.log('🛠️ Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app shell...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ App shell cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Cache installation failed:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && 
              cacheName !== OFFLINE_CACHE && 
              cacheName !== EMERGENCY_CACHE) {
            console.log(`🗑️ Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Cache-first strategy with offline fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Handle different types of requests
  const url = new URL(event.request.url);
  
  // For HTML pages, try network first, then cache
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the response for future use
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, return cached version
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline page
              return caches.match('/index.html');
            });
        })
    );
    return;
  }
  
  // For other assets (CSS, JS, images), cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Update cache in background
          fetch(event.request)
            .then(response => {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            })
            .catch(() => {}); // Ignore fetch errors for background updates
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache external CDN resources excessively
            if (url.hostname === self.location.hostname || 
                url.hostname.includes('mapbox.com') ||
                url.hostname.includes('cdnjs.cloudflare.com')) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(error => {
            console.log('Fetch failed; returning offline page:', error);
            // Return appropriate offline response
            if (event.request.destination === 'image') {
              return caches.match('https://img.icons8.com/color/96/000000/shield.png');
            }
            return new Response('Network error happened', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Background Sync for Emergency Data
self.addEventListener('sync', event => {
  console.log(`🔄 Background Sync: ${event.tag}`);
  
  if (event.tag === 'emergency-sync') {
    event.waitUntil(syncEmergencyData());
  }
});

// Sync emergency data when back online
async function syncEmergencyData() {
  try {
    console.log('📡 Syncing emergency data...');
    
    const cache = await caches.open(EMERGENCY_CACHE);
    const requests = await cache.keys();
    
    let syncCount = 0;
    
    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (response) {
          const data = await response.json();
          
          // In a real app, send to your backend server
          // For demo, we'll just log it
          console.log('📤 Syncing emergency data:', data);
          
          // Simulate server request (1 second delay)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Remove from cache after successful sync
          await cache.delete(request);
          syncCount++;
        }
      } catch (error) {
        console.error('Error syncing emergency data:', error);
      }
    }
    
    // Notify all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        service: 'emergency',
        count: syncCount,
        timestamp: new Date().toISOString()
      });
    });
    
    console.log(`✅ Emergency sync complete: ${syncCount} items`);
    
  } catch (error) {
    console.error('❌ Emergency sync failed:', error);
  }
}

// Push Notifications
self.addEventListener('push', event => {
  console.log('📱 Push notification received');
  
  let data = {
    title: '🚨 SafeRoute Emergency',
    body: 'Emergency alert from SafeRoute',
    icon: 'https://img.icons8.com/color/96/000000/shield.png',
    badge: 'https://img.icons8.com/color/72/000000/shield.png'
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'emergency-alert',
    requireInteraction: true,
    data: {
      url: data.url || '/?emergency=true',
      timestamp: Date.now(),
      type: 'emergency'
    },
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
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(clientList => {
        // Check if there's already a window/tab open
        for (const client of clientList) {
          if (client.url.includes('/') && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              action: 'view',
              data: event.notification.data
            });
            return client.focus();
          }
        }
        
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(event.notification.data.url || '/?emergency=true');
        }
      })
    );
  }
});

// Message Handler from Main App
self.addEventListener('message', event => {
  console.log('📨 Message from client:', event.data);
  
  switch (event.data.type) {
    case 'STORE_EMERGENCY':
      storeEmergencyData(event.data.payload);
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearOldCaches();
      break;
  }
});

// Store emergency data
async function storeEmergencyData(data) {
  try {
    const cache = await caches.open(EMERGENCY_CACHE);
    const url = `/emergency/${Date.now()}`;
    
    const response = new Response(JSON.stringify({
      ...data,
      storedAt: new Date().toISOString(),
      offline: true
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Stored-Offline': 'true'
      }
    });
    
    await cache.put(url, response);
    
    console.log('💾 Emergency data stored for sync');
    
    // Register background sync
    if ('SyncManager' in self.registration) {
      try {
        await self.registration.sync.register('emergency-sync');
        console.log('✅ Background sync registered for emergency data');
      } catch (syncError) {
        console.log('Background sync not available:', syncError);
      }
    }
    
    // Notify all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'EMERGENCY_STORED',
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('Failed to store emergency data:', error);
  }
}

// Clear old caches
async function clearOldCaches() {
  try {
    const cacheNames = await caches.keys();
    const currentCaches = [CACHE_NAME, OFFLINE_CACHE, EMERGENCY_CACHE];
    
    const deletions = cacheNames
      .filter(cacheName => !currentCaches.includes(cacheName))
      .map(cacheName => caches.delete(cacheName));
    
    await Promise.all(deletions);
    console.log('✅ Old caches cleared');
    
  } catch (error) {
    console.error('Failed to clear caches:', error);
  }
}

// Periodic updates (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-check') {
      console.log('🔄 Periodic sync for updates');
      event.waitUntil(checkForUpdates());
    }
  });
}

// Check for updates
async function checkForUpdates() {
  try {
    console.log('🔍 Checking for updates...');
    
    // In a real app, check with server
    // For demo, just check main page
    const response = await fetch('/', { cache: 'no-store' });
    
    if (response.ok) {
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_AVAILABLE',
          timestamp: new Date().toISOString()
        });
      });
    }
    
  } catch (error) {
    console.error('Update check failed:', error);
  }
}
