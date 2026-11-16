/* Vstars 出欠 — メンバーアプリ: 起動・ハッシュルーティング・自動ログイン・バナー
 * ルート: #/ #/login #/practices #/mypage #/register #/admin...
 * 管理ルート (#/admin...) は admin-app.js (VstarsAdminApp) に委譲する。
 */
'use strict';

(function () {
  var Api = null;
  var UI = null;
  var booted = false;
  var currentNotices = [];
  var LINE_NAME_KEY = 'vstars_line_name';

  function getApi() { return window.VstarsApi; }
  function getUI() { return window.VstarsUI; }

  function viewEl() { return document.getElementById('view'); }

  function setHeaderUser(name) {
    var el = document.getElementById('header-user');
    if (!el) { return; }
    if (name) {
      el.textContent = name;
      el.hidden = false;
      try { window.localStorage.setItem(LINE_NAME_KEY, name); } catch (e) {}
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function getStoredLineName() {
    try { return window.localStorage.getItem(LINE_NAME_KEY) || ''; } catch (e) { return ''; }
  }

  function markNav(route) {
    var links = document.querySelectorAll('#header-nav a[data-nav]');
    links.forEach(function (a) {
      if (a.getAttribute('data-nav') === route) { a.setAttribute('aria-current', 'page'); }
      else { a.removeAttribute('aria-current'); }
    });
  }

  function hideBulkBar() {
    var bar = document.getElementById('bulk-bar');
    if (bar) { bar.hidden = true; }
  }

  function isLoggedIn() {
    var api = getApi();
    return !!(api && api.getToken() && api.getMemberNo() !== null);
  }

  // トークンの有効性を確認する。成功時は会員情報 (LINE名など) を返す。
  async function verifySession() {
    var api = getApi();
    try {
      var page = await api.getMyPage();
      return { ok: true, page: page };
    } catch (e1) {
      try {
        await api.listMyNotices();
        return { ok: true, page: null };
      } catch (e2) {
        return { ok: false, error: e2 };
      }
    }
  }

  function normalizeNotice(n) {
    return {
      registrationId: n.registration_id || n.registrationId || null,
      practiceId: n.practice_id || n.practiceId || null,
      kind: n.kind || n.type || '',
      message: n.message || n.notice_text || n.text || '',
      practiceDate: n.practice_date || n.practiceDate || null,
      startTime: n.start_time || n.startTime || '',
      endTime: n.end_time || n.endTime || '',
      venue: n.venue || '',
      seenAt: n.member_seen_at || n.seen_at || n.acknowledged_at || null,
      acknowledged: !!(n.acknowledged || n.is_acknowledged)
    };
  }

  // 繰り上がり/繰り下がり通知バナー。確認されるまで表示し続ける。
  async function refreshBanner() {
    var banner = document.getElementById('notice-banner');
    var textEl = document.getElementById('notice-banner-text');
    var ackBtn = document.getElementById('notice-banner-ack');
    if (!banner || !textEl || !ackBtn) { return; }
    if (!isLoggedIn()) { banner.hidden = true; return; }
    var api = getApi();
    var UI_ = getUI();
    try {
      var raw = await api.listMyNotices();
      var list = Array.isArray(raw) ? raw : (raw && raw.notices ? raw.notices : []);
      currentNotices = list.map(normalizeNotice)
        .filter(function (n) { return !n.seenAt && !n.acknowledged; });
      if (currentNotices.length === 0) { banner.hidden = true; return; }
      var n = currentNotices[0];
      var label = n.kind === 'demotion' ? '繰り下がり' : '繰り上がり';
      var dateText = n.practiceDate ? UI_.fmtDateTimeJST(n.practiceDate, n.startTime, n.endTime) : '';
      textEl.textContent = n.message
        || (dateText + (n.venue ? ' ' + n.venue : '') + ' の練習で' + label + 'になりました。');
      banner.hidden = false;
      ackBtn.onclick = async function () {
        ackBtn.disabled = true;
        try {
          if (n.registrationId) { await api.ackStatusChange(n.registrationId); }
          UI_.toast('確認しました。');
          currentNotices.shift();
          await refreshBanner();
        } catch (e) {
          UI_.toast('確認できませんでした。もう一度お試しください。');
          ackBtn.disabled = false;
        }
      };
    } catch (e) {
      banner.hidden = true;
    }
  }

  function route() {
    var hash = window.location.hash || '#/';
    // 招待・パスワード再設定リンクから来た場合: Supabase が hash の
    // access_token をセッション化してから管理画面へ誘導する。
    // (このままルーティングすると #/login へ飛んで token が消えてしまうため)
    if (hash.indexOf('type=recovery') !== -1 || hash.indexOf('type=invite') !== -1) {
      try { window.sessionStorage.setItem('vstars_set_password', '1'); } catch (e) {}
      var api = getApi();
      if (api && api.getAdminSession) {
        api.getAdminSession().then(function () {
          window.location.hash = '#/admin';
        }).catch(function () {
          window.location.hash = '#/admin';
        });
      } else {
        window.location.hash = '#/admin';
      }
      return;
    }
    var path = hash.replace(/^#/, '').split('?')[0] || '/';
    if (path === '') { path = '/'; }
    var parts = path.split('/').filter(function (s) { return s !== ''; });

    // 管理ルートは admin-app に委譲
    if (parts[0] === 'admin') {
      markNav('admin');
      hideBulkBar();
      if (window.VstarsAdminApp && window.VstarsAdminApp.renderAdmin) {
        window.VstarsAdminApp.renderAdmin(path);
      } else {
        var v = viewEl();
        if (v) { getUI().showError(v, '管理画面を読み込めませんでした。'); }
      }
      return;
    }

    switch (parts[0] || '') {
      case '':
      case 'practices':
        if (!isLoggedIn()) { window.location.hash = '#/login'; return; }
        markNav('practices');
        window.VstarsMemberPractices.renderPractices();
        break;
      case 'mypage':
        if (!isLoggedIn()) { window.location.hash = '#/login'; return; }
        markNav('mypage');
        hideBulkBar();
        window.VstarsMemberMyPage.renderMyPage();
        break;
      case 'login':
        markNav('');
        hideBulkBar();
        setHeaderUser('');
        window.VstarsMemberLogin.renderLogin();
        break;
      case 'register':
        markNav('');
        hideBulkBar();
        window.VstarsRegistrationForm.renderRegistrationForm();
        break;
      default:
        window.location.hash = '#/practices';
        break;
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in window.navigator)) { return; }
    window.addEventListener('load', function () {
      window.navigator.serviceWorker.register('sw.js').catch(function () {
        // GitHub Pages のサブパス等で登録できない場合は PWA 化だけ諦める
      });
    });
  }

  function updateOfflineIndicator() {
    var el = document.getElementById('offline-indicator');
    if (el) { el.hidden = window.navigator.onLine !== false; }
  }

  async function startMemberApp() {
    if (booted) { route(); return; }
    booted = true;
    Api = getApi();
    UI = getUI();

    window.addEventListener('online', updateOfflineIndicator);
    window.addEventListener('offline', updateOfflineIndicator);
    updateOfflineIndicator();
    registerServiceWorker();

    if (!Api || !Api.isConfigured()) {
      var v = viewEl();
      var msg = Api ? Api.configError() : 'Supabase の設定が読み込めませんでした。';
      if (v) { UI.showError(v, msg); }
      return;
    }

    // ログイン済みならセッションを確認してヘッダー名を出す
    if (isLoggedIn()) {
      var storedName = getStoredLineName();
      if (storedName) { setHeaderUser(storedName); }
      var check = await verifySession();
      if (check.ok) {
        var page = check.page;
        var lineName = page && (page.line_name || page.lineName);
        if (lineName) { setHeaderUser(lineName); }
        refreshBanner();
      } else {
        // トークンが無効な場合はログイン画面へ (トークンは残し、再ログインで上書き)
        if ((window.location.hash || '') .indexOf('#/admin') !== 0
            && (window.location.hash || '') !== '#/register') {
          window.location.hash = '#/login';
        }
      }
    }

    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', function () {
    startMemberApp();
  });

  window.VstarsMemberApp = {
    startMemberApp: startMemberApp,
    route: route,
    refreshBanner: refreshBanner,
    setHeaderUser: setHeaderUser,
    isLoggedIn: isLoggedIn,
    verifySession: verifySession
  };
})();
