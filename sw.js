// Service Worker for SafeRoute Nigeria PWA
// Version: 2.0.0
const CACHE_NAME = 'saferoute-v2.0';
const OFFLINE_CACHE = 'saferoute-offline-v1';
const EMERGENCY_CACHE = 'saferoute-emergency-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js'
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

// Fetch Event - Network-first strategy with offline fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('safari-extension://')) {
    return;
  }
  
  // Handle different types of requests
  const requestUrl = new URL(event.request.url);
  
  // Emergency data - Store for offline
  if (requestUrl.pathname.includes('/emergency/')) {
    handleEmergencyRequest(event);
    return;
  }
  
  // External resources - Network only
  if (requestUrl.hostname !== self.location.hostname) {
    handleExternalRequest(event);
    return;
  }
  
  // App resources - Cache-first, then network
  handleAppRequest(event);
});

// Handle emergency data requests
function handleEmergencyRequest(event) {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone response to store in cache
        const responseClone = response.clone();
        
        // Store emergency data for offline sync
        caches.open(EMERGENCY_CACHE).then(cache => {
          cache.put(event.request, responseClone);
        });
        
        return response;
      })
      .catch(() => {
        // If offline, try to get from cache
        return caches.match(event.request);
      })
  );
}

// Handle external resources (CDNs, APIs)
function handleExternalRequest(event) {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache external resources excessively
        return response;
      })
      .catch(() => {
        // For Mapbox CSS/JS, try to serve from cache
        if (event.request.url.includes('mapbox-gl')) {
          return caches.match(event.request);
        }
        // For other externals, let them fail
        throw new Error('Network error');
      })
  );
}

// Handle app resources
function handleAppRequest(event) {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if available
        if (cachedResponse) {
          // Update cache in background
          fetchAndCache(event.request);
          return cachedResponse;
        }
        
        // Otherwise fetch from network
        return fetchAndCache(event.request);
      })
      .catch(() => {
        // If both cache and network fail, return offline page
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
        
        // For other file types, return appropriate response
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
  );
}

// Helper: Fetch and cache
function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      // Check if we received a valid response
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      
      // Clone the response
      const responseToCache = response.clone();
      
      // Cache the response
      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseToCache);
        });
      
      return response;
    });
}

// Background Sync for Emergency Data
self.addEventListener('sync', event => {
  console.log(`🔄 Background Sync: ${event.tag}`);
  
  if (event.tag === 'emergency-sync') {
    event.waitUntil(syncEmergencyData());
  }
  
  if (event.tag === 'location-sync') {
    event.waitUntil(syncLocationData());
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
          console.log('📤 Syncing emergency data:', data);
          
          // Simulate server request
          await simulateServerRequest(data);
          
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

// Sync location data
async function syncLocationData() {
  try {
    console.log('📍 Syncing location data...');
    
    // Get location data from IndexedDB or cache
    // This would be implemented based on your data storage
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'LOCATION_SYNC_COMPLETE',
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('❌ Location sync failed:', error);
  }
}

// Simulate server request
function simulateServerRequest(data) {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('✅ Data sent to server:', data.type || 'Unknown');
      resolve(true);
    }, 500);
  });
}

// Push Notifications
self.addEventListener('push', event => {
  console.log('📱 Push notification received:', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'SafeRoute', body: event.data.text() };
    }
  }
  
  const options = {
    body: data.body || 'Emergency alert from SafeRoute',
    icon: 'https://img.icons8.com/color/96/000000/shield.png',
    badge: 'https://img.icons8.com/color/72/000000/shield.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'emergency-alert',
    requireInteraction: true,
    data: {
      url: data.url || '/?emergency=true',
      timestamp: Date.now(),
      type: data.type || 'emergency'
    },
    actions: [
      {
        action: 'view-emergency',
        title: 'View Details',
        icon: 'https://img.icons8.com/color/48/000000/visible.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: 'https://img.icons8.com/color/48/000000/delete-sign.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || '🚨 SafeRoute Emergency',
      options
    )
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.action);
  
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  
  if (event.action === 'view-emergency' || !event.action) {
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
              action: 'view-emergency',
              data: notificationData
            });
            return client.focus();
          }
        }
        
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(notificationData.url || '/?emergency=true');
        }
      })
    );
  }
  
  // Handle other actions
  if (event.action === 'dismiss') {
    console.log('Notification dismissed');
    // Track dismissal if needed
  }
});

// Message Handler from Main App
self.addEventListener('message', event => {
  console.log('📨 Message from client:', event.data);
  
  switch (event.data.type) {
    case 'EMERGENCY_DATA':
      storeEmergencyData(event.data.payload);
      break;
      
    case 'LOCATION_DATA':
      storeLocationData(event.data.payload);
      break;
      
    case 'REGISTER_SYNC':
      registerBackgroundSync(event.data.tag);
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CHECK_UPDATE':
      checkForUpdates();
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
    const url = `/emergency/data-${Date.now()}`;
    
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
    
    console.log('💾 Emergency data stored for sync:', data.type || 'Unknown');
    
    // Notify all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'DATA_STORED',
        dataType: 'emergency',
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('Failed to store emergency data:', error);
  }
}

// Store location data
async function storeLocationData(data) {
  try {
    // In a real app, you might use IndexedDB for location history
    console.log('📍 Location data received:', data);
    
    // Store in cache for now
    const cache = await caches.open(OFFLINE_CACHE);
    const url = `/location/${Date.now()}`;
    
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put(url, response);
    
  } catch (error) {
    console.error('Failed to store location data:', error);
  }
}

// Register background sync
async function registerBackgroundSync(tag) {
  try {
    const registration = await self.registration;
    await registration.sync.register(tag);
    console.log(`✅ Background sync registered: ${tag}`);
  } catch (error) {
    console.error(`Failed to register sync ${tag}:`, error);
  }
}

// Check for updates
async function checkForUpdates() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/', { cache: 'no-store' });
    
    if (response.status === 200) {
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_CHECKED',
          hasUpdate: true,
          timestamp: new Date().toISOString()
        });
      });
    }
  } catch (error) {
    console.error('Update check failed:', error);
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

// Periodic Sync (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-content') {
      console.log('🔄 Periodic sync triggered');
      event.waitUntil(updateCachedContent());
    }
  });
}

// Update cached content
async function updateCachedContent() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          await cache.put(request, networkResponse.clone());
        }
      } catch (error) {
        console.log(`Failed to update: ${request.url}`);
      }
    }
    
    console.log('✅ Cached content updated');
    
  } catch (error) {
    console.error('Failed to update cached content:', error);
  }
}
