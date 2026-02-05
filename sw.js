// Service Worker for SafeRoute PWA
const CACHE_NAME = 'saferoute-v2';
const OFFLINE_CACHE = 'saferoute-offline-data';
const EMERGENCY_CACHE = 'saferoute-emergencies';

// Assets to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.js',
  'https://api.mapbox.com/mapbox-gl-js/v2.9.1/mapbox-gl.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://img.icons8.com/color/180/000000/shield.png',
  'https://img.icons8.com/color/32/000000/shield.png',
  'https://img.icons8.com/color/16/000000/shield.png',
  'https://img.icons8.com/color/96/000000/shield.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== OFFLINE_CACHE && 
                cacheName !== EMERGENCY_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim clients immediately
      self.clients.claim()
    ])
  );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Handle mapbox API requests
  if (request.url.includes('mapbox')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(request)
            .then(response => {
              // Cache the mapbox response
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(request, responseClone));
              return response;
            })
            .catch(() => {
              // Return offline fallback for map
              return new Response(
                JSON.stringify({ error: 'Offline - Map unavailable' }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            });
        })
    );
    return;
  }
  
  // For HTML requests - network first
  if (request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Update cache with fresh response
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cachedResponse => cachedResponse || caches.match('/'));
        })
    );
    return;
  }
  
  // For other resources - cache first
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request)
          .then(response => {
            // Don't cache if not successful
            if (!response.ok) return response;
            
            // Cache the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, responseClone));
            return response;
          });
      })
  );
});

// Background sync for emergency alerts
self.addEventListener('sync', event => {
  console.log('🔄 Background sync event:', event.tag);
  
  if (event.tag === 'emergency-sync') {
    event.waitUntil(syncEmergencyData());
  }
});

// Sync emergency data when back online
async function syncEmergencyData() {
  console.log('🔄 Syncing emergency data...');
  
  try {
    // Open emergency cache
    const emergencyCache = await caches.open(EMERGENCY_CACHE);
    const requests = await emergencyCache.keys();
    
    let syncedCount = 0;
    
    // Process each stored emergency
    for (const request of requests) {
      const response = await emergencyCache.match(request);
      if (!response) continue;
      
      const emergencyData = await response.json();
      
      try {
        // Attempt to send emergency data to server/API
        const sendResult = await sendEmergencyToServer(emergencyData);
        
        if (sendResult) {
          // Remove from cache if successfully sent
          await emergencyCache.delete(request);
          syncedCount++;
          console.log('✅ Emergency data synced:', emergencyData);
        }
      } catch (error) {
        console.log('❌ Failed to sync emergency:', error);
        // Keep in cache for next sync attempt
      }
    }
    
    // Notify app about sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        count: syncedCount,
        timestamp: new Date().toISOString()
      });
    });
    
    return syncedCount;
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    throw error;
  }
}

// Send emergency data to server
async function sendEmergencyToServer(data) {
  // This is where you'd implement your actual API endpoint
  // For now, we'll simulate with a fake API
  
  console.log('📤 Sending emergency to server:', data);
  
  // Simulate API endpoint - replace with your actual endpoint
  const API_ENDPOINT = 'https://your-api.com/emergency';
  
  try {
    // Real implementation would look like:
    // const response = await fetch(API_ENDPOINT, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     type: 'emergency',
    //     data: data,
    //     app_id: 'saferoute-ng'
    //   })
    // });
    
    // For demo purposes - simulate success
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate 90% success rate for demo
    const success = Math.random() > 0.1;
    
    if (success) {
      return { success: true, message: 'Emergency reported' };
    } else {
      throw new Error('Server error');
    }
    
  } catch (error) {
    console.error('❌ Server send failed:', error);
    throw error;
  }
}

// Handle messages from main app
self.addEventListener('message', event => {
  console.log('📩 Message from app:', event.data);
  
  const { type, payload } = event.data;
  
  switch (type) {
    case 'STORE_EMERGENCY':
      storeEmergencyData(payload);
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

// Store emergency data for offline sync
async function storeEmergencyData(data) {
  console.log('💾 Storing emergency data offline:', data);
  
  try {
    const emergencyCache = await caches.open(EMERGENCY_CACHE);
    
    // Create unique URL for this emergency
    const emergencyId = `emergency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const emergencyUrl = new URL(`/emergency/${emergencyId}`, self.location.origin);
    
    // Store in cache
    await emergencyCache.put(
      emergencyUrl,
      new Response(JSON.stringify({
        ...data,
        storedAt: new Date().toISOString(),
        syncAttempts: 0
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    
    // Notify app
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'EMERGENCY_STORED',
        id: emergencyId,
        timestamp: new Date().toISOString()
      });
    });
    
    // Register for background sync
    if ('SyncManager' in self.registration) {
      try {
        await self.registration.sync.register('emergency-sync');
        console.log('✅ Background sync registered');
      } catch (error) {
        console.log('Background sync registration failed:', error);
      }
    }
    
    console.log('✅ Emergency data stored for sync');
    
  } catch (error) {
    console.error('❌ Failed to store emergency data:', error);
  }
}

// Periodic sync for emergencies (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'emergency-periodic-sync') {
      console.log('⏰ Periodic sync triggered');
      event.waitUntil(syncEmergencyData());
    }
  });
}

// Handle push notifications for emergencies
self.addEventListener('push', event => {
  console.log('📢 Push notification received:', event);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'SafeRoute Emergency';
  const options = {
    body: data.body || 'Emergency alert received',
    icon: 'https://img.icons8.com/color/96/000000/shield.png',
    badge: 'https://img.icons8.com/color/96/000000/shield.png',
    vibrate: [200, 100, 200, 100, 200, 100, 400],
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

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.notification.data);
  
  event.notification.close();
  
  const { action, notification } = event;
  
  if (action === 'dismiss') {
    return;
  }
  
  // For view action or default click
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
