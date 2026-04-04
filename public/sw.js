// Cypher Log Service Worker
// Version should be updated when deploying new versions
const CACHE_VERSION = 'v5';
const STATIC_CACHE = `cypherlog-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `cypherlog-dynamic-${CACHE_VERSION}`;

// Core app shell files that should always be cached
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// External resources to cache (fonts, etc.)
const EXTERNAL_RESOURCES = [];

// Maximum items in dynamic cache
const MAX_DYNAMIC_CACHE_ITEMS = 50;

// URLs that should NEVER be cached (always fetch from network)
const NEVER_CACHE_PATTERNS = [
  /^wss?:\/\//,  // WebSocket connections
  /\/api\//,     // API endpoints
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        // Activate immediately without waiting
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache app shell:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete caches that don't match current version
              return name.startsWith('cypherlog-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned up');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// Helper function to limit dynamic cache size
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Delete oldest entries (first in, first out)
    const deleteCount = keys.length - maxItems;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Helper to determine if request is for static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  return (
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ttf') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.ico')
  );
}

// Helper to determine if request is an API/WebSocket call
function isApiRequest(request) {
  const url = new URL(request.url);
  return (
    url.protocol === 'wss:' ||
    url.protocol === 'ws:' ||
    url.pathname.startsWith('/api/')
  );
}

// Helper to check if URL should never be cached
function shouldNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

// Network-first strategy with cache fallback
async function networkFirst(request, cacheName = DYNAMIC_CACHE) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      // Trim cache in background
      trimCache(cacheName, MAX_DYNAMIC_CACHE_ITEMS);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // For navigation requests, return the cached index.html
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    throw error;
  }
}

// Cache-first strategy with network fallback (for static assets)
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background (stale-while-revalidate)
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(cacheName).then((cache) => {
            cache.put(request, response);
          });
        }
      })
      .catch(() => {
        // Network failed, but we have cache - that's fine
      });
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket requests entirely - let them pass through
  if (url.protocol === 'wss:' || url.protocol === 'ws:') {
    return;
  }

  // Skip requests that should never be cached
  if (shouldNeverCache(request.url)) {
    return;
  }

  // Skip cross-origin requests that aren't cacheable
  if (url.origin !== location.origin) {
    // Allow caching of external fonts and CDN resources only
    if (!url.pathname.includes('fonts') && 
        !url.hostname.includes('cdn') &&
        !url.hostname.includes('esm.sh')) {
      // For other cross-origin requests, don't intercept - let them go directly to network
      return;
    }
  }

  // Handle navigation requests (HTML pages) - always try network first for fresh content
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, STATIC_CACHE)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Handle static assets with cache-first strategy
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Default: network-first for everything else
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('cypherlog-'))
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});

// Background sync for offline actions (if supported)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  // Could be used for syncing offline data when connection is restored
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'You have a maintenance reminder',
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
      },
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Cypher Log', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

console.log('[SW] Service worker script loaded');
