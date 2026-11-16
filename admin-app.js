/* Vstars 出欠 — 管理アプリ: ルーティングと共通部品
 * ルート: #/admin (ダッシュボード) #/admin/practices #/admin/members
 *        #/admin/requests #/admin/withdrawals #/admin/reports
 * 未ログインなら管理者ログイン画面を出す。管理者も同じ URL/アプリを使う。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function adminTabs(active) {
    var nav = document.createElement('nav');
    nav.className = 'admin-tabs';
    nav.setAttribute('aria-label', '管理メニュー');
    [
      ['#/admin', 'dashboard', 'ダッシュボード'],
      ['#/admin/practices', 'practices', '練習管理'],
      ['#/admin/members', 'members', 'メンバー管理'],
      ['#/admin/requests', 'requests', '登録申請'],
      ['#/admin/withdrawals', 'withdrawals', '退会候補'],
      ['#/admin/reports', 'reports', '集計・出力']
    ].forEach(function (t) {
      var a = document.createElement('a');
      a.href = t[0];
      a.textContent = t[2];
      if (t[1] === active) { a.setAttribute('aria-current', 'page'); }
      nav.appendChild(a);
    });
    return nav;
  }

  function adminHeader(view, active, title) {
    view.innerHTML = '';
    view.appendChild(adminTabs(active));
    var h = document.createElement('h1');
    h.className = 'view-title';
    h.textContent = title;
    view.appendChild(h);
    return view;
  }

  async function requireAdmin() {
    var api = Api();
    if (!api || !api.isConfigured()) { return false; }
    try {
      var session = await api.getAdminSession();
      return !!session;
    } catch (e) {
      return false;
    }
  }

  async function renderAdmin(path) {
    var view = viewEl();
    if (!view) { return; }
    var ok = await requireAdmin();
    if (!ok) {
      window.VstarsAdminAuth.renderAdminLogin();
      return;
    }
    // 招待・再設定リンク経由ならパスワード設定画面を出す。
    var setPw = false;
    try { setPw = window.sessionStorage.getItem('vstars_set_password') === '1'; } catch (e) {}
    if (setPw && window.VstarsAdminAuth.renderSetPassword) {
      window.VstarsAdminAuth.renderSetPassword(view);
      return;
    }
    var parts = (path || '#/admin').replace(/^#/, '').split('/').filter(function (s) { return s !== ''; });
    var sub = parts[1] || '';
    switch (sub) {
      case '':
        window.VstarsAdminDashboard.renderDashboard();
        break;
      case 'practices':
        window.VstarsAdminPractices.renderAdminPractices();
        break;
      case 'members':
        window.VstarsAdminMembers.renderAdminMembers();
        break;
      case 'requests':
        window.VstarsAdminMembers.renderRegistrationRequests();
        break;
      case 'withdrawals':
        window.VstarsAdminMembers.renderWithdrawals();
        break;
      case 'reports':
        window.VstarsAdminReports.renderAdminReports();
        break;
      default:
        window.location.hash = '#/admin';
        break;
    }
  }

  async function signOut() {
    try { await Api().signOutAdmin(); } catch (e) {}
    window.location.hash = '#/login';
  }

  window.VstarsAdminApp = {
    renderAdmin: renderAdmin,
    adminTabs: adminTabs,
    adminHeader: adminHeader,
    requireAdmin: requireAdmin,
    signOut: signOut,
    startAdminApp: function () { renderAdmin(window.location.hash || '#/admin'); }
  };
})();
