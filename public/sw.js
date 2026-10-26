// Service worker for the Stand Firm web app. Its only job is notifications;
// it doesn't cache anything, so updates reach people immediately.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Payload comes from supabase/functions/_shared/util.ts: { title, body, data }.
// iOS revokes push permission from sites that don't show a notification for
// every push, so always show one.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Stand Firm', {
      body: payload.body || 'A brother is asking for prayer.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.alertId,
      renotify: true,
      data,
    }),
  );
});

// Open the alert: reuse an open window if there is one, otherwise launch the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alertId = event.notification.data && event.notification.data.alertId;
  const url = alertId ? `/alert/${alertId}` : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        if (alertId) existing.postMessage({ type: 'open-alert', alertId });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
