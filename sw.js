/* Vstars 出欠 — サービスワーカー
 * キャッシュファースト: 同一オリジンの静的アセット (html/css/js/icons) のみ。
 * Supabase への通信 (supabase.co / /rest/ /auth/ /functions/) は
 * 絶対にキャッシュせずネットワークのみ。オフライン時はキャッシュした index を返す。
 */
'use strict';

var CACHE_NAME = 'vstars-v29';
var CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './config.js',
  './vendor/supabase.min.js',
  './api.js',
  './ui.js',
  './v19-pure.js',
  './member-app.js',
  './member-login.js',
  './member-practices.js',
  './member-calendar.js',
  './member-my-page.js',
  './admin-app.js',
  './admin-auth.js',
  './admin-dashboard.js',
  './admin-practices.js',
  './admin-members.js',
  './admin-attendance.js',
  './admin-reports.js',
  './admin-logs.js',
  './chat.js',
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
  // 通知の URL には2形式ある:
  //   (a) '/#/practice/<id>' のようなアプリ内パス → scope を基点に解決する
  //   (b) '/vstars-attendance/#/practice/<id>' のように配置パスを含む絶対パス
  //       (SQL 22 以降の _enqueue_push が生成) → そのまま origin に付ける
  // (b) を scope 基点で解決するとパスが二重になり GitHub Pages の 404 になる。
  var fullUrl;
  if (/^https?:\/\//i.test(targetUrl)) {
    fullUrl = targetUrl;
  } else {
    var scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
    if (targetUrl === scopePath
      || targetUrl.indexOf(scopePath + '/') === 0
      || targetUrl.indexOf(scopePath + '#') === 0) {
      fullUrl = self.location.origin + targetUrl;
    } else {
      var base = self.registration.scope.replace(/\/$/, '');
      var path = targetUrl.charAt(0) === '/' ? targetUrl : '/' + targetUrl;
      fullUrl = base + path;
    }
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        // 通知の URL が開いているタブはその URL へ遷移させてから前面化する。
        // 従来はフォーカスだけで遷移しなかったため、練習詳細が開かれなかった。
        if ('focus' in clients[i]) {
          if (clients[i].url === fullUrl) { return clients[i].focus(); }
          if ('navigate' in clients[i]) {
            return clients[i].navigate(fullUrl).then(function (c) { return c.focus(); });
          }
          return clients[i].focus();
        }
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
