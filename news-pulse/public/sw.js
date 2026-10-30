const SHELL = 'np-shell-v2';
const DATA = 'np-data-v2';
const SHELL_FILES = ['/', '/app.js', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/api/stream') return;

  if (url.pathname.startsWith('/api/')) {
    // Network first so news is fresh; fall back to the last copy when offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(DATA).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || Response.json({ error: 'offline' }, { status: 503 }))),
    );
    return;
  }

  const key = e.request.mode === 'navigate' ? '/' : e.request;
  // Stale-while-revalidate for the app shell.
  e.respondWith(
    caches.match(key).then((cached) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res.ok && e.request.mode !== 'navigate') caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return e.request.mode === 'navigate' ? net.then((r) => r || cached) : cached || net;
    }),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data.json();
  } catch {
    data = { title: 'NewsPulse', body: e.data?.text() || '' };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'NewsPulse', {
      body: [data.body, data.meta].filter(Boolean).join('\n'),
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => new URL(c.url).origin === location.origin);
      if (win) return win.navigate(target).then((c) => (c || win).focus());
      return self.clients.openWindow(target);
    }),
  );
});
