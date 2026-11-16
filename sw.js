/* Vstars 出欠 — サービスワーカー
 * キャッシュファースト: 同一オリジンの静的アセット (html/css/js/icons) のみ。
 * Supabase への通信 (supabase.co / /rest/ /auth/ /functions/) は
 * 絶対にキャッシュせずネットワークのみ。オフライン時はキャッシュした index を返す。
 */
'use strict';

var CACHE_NAME = 'vstars-v13';
var CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './config.js',
  './api.js',
  './ui.js',
  './member-app.js',
  './member-login.js',
  './member-practices.js',
  './member-my-page.js',
  './admin-app.js',
  './admin-auth.js',
  './admin-dashboard.js',
  './admin-practices.js',
  './admin-members.js',
  './admin-reports.js',
  './registration-form.js',
  './icon-192.png',
  './icon-512.png'
];

function isSupabaseRequest(url) {
  return url.hostname.indexOf('supabase.co') !== -1
    || url.pathname.indexOf('/rest/') !== -1
    || url.pathname.indexOf('/auth/') !== -1
    || url.pathname.indexOf('/functions/') !== -1;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // アイコンが未作成の場合は失敗してもインストールを止めない
      return Promise.all(CORE_ASSETS.map(function (asset) {
        return cache.add(asset).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('push', function (event) {
  var data = { title: 'Vstars 出欠', body: '', url: '/' };
  try {
    if (event.data) {
      var incoming = event.data.json();
      if (incoming.title) { data.title = incoming.title; }
      if (incoming.body) { data.body = incoming.body; }
      if (incoming.url) { data.url = incoming.url; }
    }
  } catch (e) { /* ペイロードが読めなければ既定文言で表示 */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'vstars-promotion',
      renotify: true,
      data: { url: data.url }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  var fullUrl = new URL(targetUrl, self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) { return clients[i].focus(); }
      }
      if (self.clients.openWindow) { return self.clients.openWindow(fullUrl); }
      return undefined;
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);

  // Supabase 通信はネットワークのみ (キャッシュ禁止)
  if (isSupabaseRequest(url)) {
    event.respondWith(fetch(req));
    return;
  }

  // 同一オリジンの静的アセットのみキャッシュファースト
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) { return cached; }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // オフライン時のフォールバック: キャッシュした index
        if (req.mode === 'navigate' || req.headers.get('accept') === 'text/html'
            || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
          return caches.match('./index.html');
        }
        throw new Error('offline');
      });
    })
  );
});
