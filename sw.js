// 離線快取：App 本體先用網路（確保拿到最新版），失敗才用快取。
// 試算表資料（script.google.com）一律不快取。
const VERSION = 'koko-v1.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/tokens.css', 'css/app.css',
  'js/app.js', 'js/bus.js', 'js/calc.js', 'js/demo.js', 'js/forms.js', 'js/icons.js', 'js/prices.js', 'js/appicon.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views/home.js', 'js/views/ledger.js', 'js/views/assets.js', 'js/views/stats.js', 'js/views/settings.js',
  'assets/brand/logo.png', 'assets/brand/mascot-peek.png', 'assets/brand/paw.png',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
