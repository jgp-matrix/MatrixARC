// ── MatrixARC Service Worker — Push Notifications Only ──
// No caching / offline support — this SW exists solely for FCM push handling.

self.addEventListener('install', (event) => {
  // Activate immediately, don't wait for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all open clients so push works without a page reload
  event.waitUntil(self.clients.claim());
});

// ── Push event — show a native notification ──
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // If payload isn't JSON, use text as body
    data = { notification: { title: 'MatrixARC', body: event.data ? event.data.text() : '' } };
  }

  const notif = data.notification || {};
  const payload = data.data || {};

  const title = notif.title || payload.title || 'MatrixARC';
  const options = {
    body: notif.body || payload.body || '',
    icon: notif.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload, // pass through so notificationclick can use it
    tag: payload.tag || 'arc-notification', // collapse duplicate notifications
    renotify: true,
    requireInteraction: true, // persist until user clicks or dismisses
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click — open / focus the app ──
// DECISION(v1.19.963, security audit M-1): Validate `data.url` against the SW's own
// origin before navigate/openWindow. Today the only sender is sendPushToUser in
// functions/index.js (always sets url: APP_URL), so this is defense-in-depth — if
// any future Cloud Function ever forwards user-controlled content into data.url,
// the SW will not blindly navigate the ARC tab to an attacker-chosen origin.
function _isSafeNavigationUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  // Allow same-origin paths like '/' or '/?rfqUpload=...'
  if (url.startsWith('/')) return true;
  // Allow same-origin absolute URLs
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';
  if (!_isSafeNavigationUrl(targetUrl)) {
    console.warn('[SW] notification click rejected unsafe target URL:', targetUrl);
    targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If an ARC tab is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (targetUrl && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // No existing tab — open a new one
      return self.clients.openWindow(targetUrl);
    })
  );
});
