// ============================================================
// ILMUVERSE · JADUAL CIKGU - service worker ringkas
// Diperlukan supaya noti boleh keluar di Chrome Android
// (Android tidak membenarkan `new Notification()` terus dari halaman).
// ============================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Tekan noti -> buka/fokus halaman Jadual Cikgu.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const semua = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ada = semua.find((c) => c.url.includes('/jadual-cikgu.html'));
    if (ada) return ada.focus();
    return self.clients.openWindow('/jadual-cikgu.html');
  })());
});
