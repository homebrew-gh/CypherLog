/**
 * Service Worker registration and update handler.
 * Loaded from index.html; runs in global scope.
 */
(function () {
  // Capacitor WebView: skip SW (cache/update flow is handled by app deploy + sync)
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      console.log('[App] SW registered:', registration.scope);

      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
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

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[App] New service worker activated');
  });

  window.addEventListener('online', () => {
    document.body.classList.remove('offline');
    if (window.handleOnlineStatus) window.handleOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
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
