// sw.js — Service Worker for Insulin Tracker
// Handles background sync and scheduled 9 PM CST notifications

const CACHE_NAME = 'insulin-tracker-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// ── Install & Cache ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();

  // Schedule the first notification check
  scheduleNextCheck();
});

// ── Fetch (offline support) ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── Notification scheduling ───────────────────────────────────────────────────
// We use a periodic "alarm" via setTimeout stored in IndexedDB-backed logic.
// Since SWs can be killed, we reschedule on every SW start.

function getChicagoMidnightUTC(date) {
  // Get midnight CST/CDT for a given date using Intl
  // We want 21:00 (9 PM) Chicago time expressed as UTC ms
  const str = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(date);
  // Parse: "MM/DD/YYYY, HH:MM:SS"
  const [datePart] = str.split(', ');
  const [mm, dd, yyyy] = datePart.split('/');
  // Construct 9 PM Chicago time as a UTC date
  // We'll use the Date constructor with timeZone trick via Intl
  return null; // placeholder; see below
}

function msUntilNext9pmCST() {
  const now = new Date();

  // Format current time in Chicago
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });

  const parts = {};
  formatter.formatToParts(now).forEach(p => {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  });

  // Build a Date that represents today 21:00:00 in Chicago
  // We do this by finding the UTC offset: get now as UTC ms, then compute
  // the difference between Chicago local midnight and UTC midnight.

  // Create "today 9 PM Chicago" by building a UTC date offset
  // Trick: format "today 9 PM" as a UTC timestamp string using Intl
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const target = new Date(chicagoNow);
  target.setHours(21, 0, 0, 0);

  // If target is in the past (already past 9 PM Chicago), move to tomorrow
  if (chicagoNow >= target) {
    target.setDate(target.getDate() + 1);
  }

  // Convert back to real UTC ms
  const chicagoOffset = chicagoNow.getTime() - now.getTime();
  const targetUTC = target.getTime() - chicagoOffset;

  return Math.max(0, targetUTC - now.getTime());
}

function getDayOfYear() {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const start = new Date(chicagoNow.getFullYear(), 0, 0);
  const diff = chicagoNow - start;
  return Math.floor(diff / 86400000);
}

function getTonightSide() {
  const doy = getDayOfYear();
  return doy % 2 === 1 ? 'Left' : 'Right';
}

let notifTimer = null;

function scheduleNextCheck() {
  if (notifTimer) clearTimeout(notifTimer);

  const ms = msUntilNext9pmCST();
  console.log(`[SW] Next 9 PM CST notification in ${Math.round(ms / 60000)} minutes`);

  notifTimer = setTimeout(async () => {
    await fireNotification();
    scheduleNextCheck(); // reschedule for next night
  }, ms);
}

async function fireNotification() {
  const side = getTonightSide();
  const emoji = side === 'Left' ? '⬅️' : '➡️';

  // Check if user already marked done today
  // We can't easily read localStorage from SW, so we just always notify
  // and let the app state handle it
  const clients = await self.clients.matchAll({ type: 'window' });

  await self.registration.showNotification('Insulin Reminder', {
    body: `${emoji} Tonight's injection: ${side} side`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'insulin-nightly',
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open app' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// Reschedule whenever SW wakes up
scheduleNextCheck();
