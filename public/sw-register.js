/**
 * Service Worker registration and update handler.
 * Loaded from index.html; runs in global scope.
 *
 * Important: Capacitor is initialized by the deferred ES module in <head>, which
 * runs *after* this file's top-level code. A synchronous `window.Capacitor`
 * check is unreliable and caused the SW to register in the Android WebView,
 * cache old bundles, and hide UI updates until cache cleared.
 */
(function () {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /**
   * True when running inside a Capacitor native WebView (Android or iOS).
   * `androidBridge` is injected by the Android layer before app JS (see amberSignerPlugin).
   * After the main bundle loads, `Capacitor.isNativePlatform()` is definitive.
   */
  function isCapacitorNativeApp() {
    if (typeof window === 'undefined') return false;
    var w = window;
    if (w.androidBridge != null) return true;
    if (typeof w.Capacitor !== 'undefined' && typeof w.Capacitor.isNativePlatform === 'function') {
      try {
        return w.Capacitor.isNativePlatform();
      } catch (e) {
        return false;
      }
    }
    // iOS Capacitor: native bridge is exposed on webkit before Capacitor JS in some loads
    if (w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.capacitor) return true;
    return false;
  }

  async function tearDownServiceWorkerForNative() {
    var cleared = false;
    var regs = await navigator.serviceWorker.getRegistrations();
    for (var i = 0; i < regs.length; i++) {
      await regs[i].unregister();
      cleared = true;
    }
    if (typeof caches !== 'undefined' && caches.keys) {
      var keys = await caches.keys();
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf('cypherlog-') === 0) {
          await caches.delete(keys[j]);
          cleared = true;
        }
      }
    }
    return cleared;
  }

  window.addEventListener('load', async function () {
    if (isCapacitorNativeApp()) {
      try {
        var didClear = await tearDownServiceWorkerForNative();
        if (didClear) {
          location.reload();
        }
      } catch (err) {
        console.warn('[App] Native WebView SW cleanup failed:', err);
      }
      return;
    }

    try {
      var registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      console.log('[App] SW registered:', registration.scope);

      setInterval(function () {
        registration.update();
      }, 60 * 60 * 1000);

      registration.addEventListener('updatefound', function () {
        var newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.showUpdateNotification) {
                window.showUpdateNotification();
              } else {
                console.log('[App] New version available. Refresh to update.');
              }
            }
          });
        }
      });
    } catch (err) {
      console.error('[App] SW registration failed:', err);
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    console.log('[App] New service worker activated');
  });

  window.addEventListener('online', function () {
    document.body.classList.remove('offline');
    if (window.handleOnlineStatus) window.handleOnlineStatus(true);
  });

  window.addEventListener('offline', function () {
    document.body.classList.add('offline');
    if (window.handleOnlineStatus) window.handleOnlineStatus(false);
  });

  if (!navigator.onLine) {
    document.body.classList.add('offline');
  }

  document.body.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) return;
    var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    if (scrollTop === 0 && e.touches[0].clientY > 0) {
      // Only prevent at very top
    }
  }, { passive: true });
})();
