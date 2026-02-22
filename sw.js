// sw.js — Service Worker for Insulin Tracker
// Handles offline caching and scheduled notifications at user-defined time

const CACHE_NAME = 'insulin-tracker-v2';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// Default time: 21:00 (9 PM CST). Overridden via postMessage from app.
let scheduledHour = 21;
let scheduledMinute = 0;

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
  scheduleNextCheck();
});

// ── Fetch (offline support) ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── Message handler (receive time from app) ───────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_TIME') {
    const [h, m] = event.data.time.split(':').map(Number);
    scheduledHour = h;
    scheduledMinute = m;
    scheduleNextCheck();
    console.log(`[SW] Time updated to ${h}:${String(m).padStart(2,'0')} CST`);
  }
});

// ── Notification scheduling ───────────────────────────────────────────────────
function msUntilNextScheduledTime() {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

  const target = new Date(chicagoNow);
  target.setHours(scheduledHour, scheduledMinute, 0, 0);

  if (chicagoNow >= target) {
    target.setDate(target.getDate() + 1);
  }

  const chicagoOffset = chicagoNow.getTime() - now.getTime();
  const targetUTC = target.getTime() - chicagoOffset;

  return Math.max(0, targetUTC - now.getTime());
}

function getDayOfYear() {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const start = new Date(chicagoNow.getFullYear(), 0, 0);
  return Math.floor((chicagoNow - start) / 86400000);
}

function getTonightSide() {
  return getDayOfYear() % 2 === 0 ? 'Left' : 'Right';
}

let notifTimer = null;

function scheduleNextCheck() {
  if (notifTimer) clearTimeout(notifTimer);

  const ms = msUntilNextScheduledTime();
  console.log(`[SW] Next notification in ${Math.round(ms / 60000)} min`);

  notifTimer = setTimeout(async () => {
    await fireNotification();
    scheduleNextCheck();
  }, ms);
}

async function fireNotification() {
  const side = getTonightSide();
  const emoji = side === 'Left' ? '⬅️' : '➡️';

  await self.registration.showNotification('Insulin Reminder', {
    body: `${emoji} Tonight's injection: ${side} side`,
    icon: '/insulininjector/icon-192.png',
    badge: '/insulininjector/icon-192.png',
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
      return self.clients.openWindow('/insulininjector/');
    })
  );
});

scheduleNextCheck();
