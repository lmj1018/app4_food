export function registerServiceWorker() {
  const query = new URLSearchParams(window.location.search);
  const fromApp =
    query.get('fromApp') === '1' || query.get('isPinballApp') === '1';
  const disabledByQuery = query.get('disableSw') === '1';
  const isLocalFile = window.location.protocol === 'file:' || window.location.origin === 'null';
  const shouldDisable = fromApp || disabledByQuery || isLocalFile;

  if (shouldDisable) {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((reg) => {
            reg.unregister().catch(() => {
            });
          });
        });
      }
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.delete(key).catch(() => {
            });
          });
        });
      }
    } catch (err) {
      console.warn('service worker disable failed', err);
    }
    return;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = './service-worker.js';
      navigator.serviceWorker
        .register(swUrl)
        .then((reg) => console.log('service worker registered', reg.scope))
        .catch((err) => console.error('service worker registration failed', err));
    });
  }
}
