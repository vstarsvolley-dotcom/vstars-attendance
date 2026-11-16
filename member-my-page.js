/* Vstars 出欠 — マイページ
 * get_my_page → 会員区分 (新規/既存)、休会状態、今月の出席回数・出席率、
 * 自分の申し込み一覧 (キャンセル可)、ログアウト。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function renderMyPage() {
    var view = viewEl();
    if (!view) { return; }
    UI().showLoading(view, 'マイページを読み込み中…');
    Api().getMyPage().then(function (page) {
      drawMyPage(view, page || {});
    }).catch(function (e) {
      UI().showError(view, 'マイページを読み込めませんでした。' + (e && e.message ? ' ' + e.message : ''), renderMyPage);
    });
  }

  function drawMyPage(view, page) {
    view.innerHTML = '';
    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = 'マイページ';
    view.appendChild(title);

    var lineName = page.line_name || page.lineName || '';
    var memberNo = page.member_no !== undefined ? page.member_no : Api().getMemberNo();
    var memberType = page.member_type || page.memberType || '';
    var isRegular = page.is_regular || page.isRegular;
    var onLeave = page.on_leave || page.onLeave;
    var leaveInfo = page.leave || page.leave_info || null;
    var monthCount = page.month_attendance_count !== undefined ? page.month_attendance_count
      : (page.attendance_count !== undefined ? page.attendance_count : null);
    var monthRate = page.month_attendance_rate !== undefined ? page.month_attendance_rate
      : (page.attendance_rate !== undefined ? page.attendance_rate : null);
    var monthLabel = page.month_label || page.month || '';

    var typeText = '';
    if (memberType === 'regular' || isRegular) { typeText = '既存（レギュラー）'; }
    else if (memberType === 'new' || memberType === '新規') { typeText = '新規'; }
    else if (memberType) { typeText = String(memberType); }
    else { typeText = isRegular ? '既存' : '新規'; }

    var leaveText = '休会していません';
    if (onLeave) {
      leaveText = '休会中';
      if (leaveInfo) {
        var s = leaveInfo.start_date || leaveInfo.startDate || '';
        var e2 = leaveInfo.end_date || leaveInfo.endDate || '';
        if (s || e2) { leaveText += '（' + s + (e2 ? '〜' + e2 : '〜') + '）'; }
      }
    }

    var info = document.createElement('ul');
    info.className = 'info-list';
    [
      ['LINE 名', lineName || '—'],
      ['会員番号', memberNo !== null && memberNo !== undefined ? String(memberNo) : '—'],
      ['会員区分', typeText],
      ['休会状態', leaveText]
    ].forEach(function (kv) {
      var li = document.createElement('li');
      var k = document.createElement('span');
      k.className = 'key';
      k.textContent = kv[0];
      var v = document.createElement('span');
      v.className = 'val';
      v.textContent = kv[1];
      li.appendChild(k);
      li.appendChild(v);
      info.appendChild(li);
    });
    view.appendChild(info);

    // 今月の出席
    var statGrid = document.createElement('div');
    statGrid.className = 'stat-grid';
    var now = new Date();
    var monthTitle = monthLabel || (now.getFullYear() + '年' + (now.getMonth() + 1) + '月');
    var c1 = document.createElement('div');
    c1.className = 'stat-card';
    c1.innerHTML = '<p class="stat-label">' + UI().esc(monthTitle) + 'の出席回数</p>'
      + '<p class="stat-value">' + UI().esc(monthCount === null ? '—' : String(monthCount)) + '回</p>';
    statGrid.appendChild(c1);
    var c2 = document.createElement('div');
    c2.className = 'stat-card';
    var rateText = monthRate === null || monthRate === undefined ? '—'
      : (typeof monthRate === 'number' && monthRate <= 1 ? Math.round(monthRate * 100) + '%' : String(monthRate) + '%');
    c2.innerHTML = '<p class="stat-label">' + UI().esc(monthTitle) + 'の出席率</p>'
      + '<p class="stat-value">' + UI().esc(rateText) + '</p>'
      + '<p class="stat-sub">出席回数 ÷ 開催回数（中止を除く）</p>';
    statGrid.appendChild(c2);
    view.appendChild(statGrid);

    // 自分の申し込み一覧
    var sec = document.createElement('h2');
    sec.className = 'section-title';
    sec.textContent = '自分の申し込み';
    view.appendChild(sec);

    var regs = page.registrations || page.my_registrations || page.myRegistrations || [];
    if (!Array.isArray(regs) || regs.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '申し込み中の練習はありません。';
      view.appendChild(empty);
    } else {
      var list = document.createElement('div');
      list.className = 'my-reg-list';
      regs.forEach(function (r) {
        var date = r.practice_date || r.date;
        var status = r.status || r.my_status || '';
        var item = document.createElement('div');
        item.className = 'my-reg-item';
        var row = document.createElement('div');
        row.className = 'row';
        var d = document.createElement('span');
        d.className = 'date';
        d.textContent = UI().fmtDateTimeJST(date, r.start_time, r.end_time) + ' ' + (r.venue || '');
        row.appendChild(d);
        var badge = document.createElement('span');
        badge.className = 'status-badge ' + UI().statusClass(r);
        badge.textContent = UI().statusLabel(r);
        row.appendChild(badge);
        item.appendChild(row);
        var regId = r.registration_id || r.id;
        var active = status !== 'cancelled' && status !== 'キャンセル済み' && status !== 'canceled';
        if (regId && active) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-cancel btn-small';
          btn.textContent = 'キャンセルする';
          btn.style.marginTop = '8px';
          btn.addEventListener('click', async function () {
            var ok = await UI().confirmSheet({
              title: 'キャンセルしますか？',
              body: UI().fmtDateTimeJST(date, r.start_time, r.end_time) + ' ' + (r.venue || '') + ' の申し込みをキャンセルします。',
              okLabel: 'キャンセルする',
              danger: true
            });
            if (!ok) { return; }
            try {
              await Api().cancelRegistration(regId);
              UI().toast('キャンセルしました。');
              renderMyPage();
            } catch (e) {
              UI().toast('キャンセルできませんでした。' + (e && e.message ? ' ' + e.message : ''));
            }
          });
          item.appendChild(btn);
        }
        list.appendChild(item);
      });
      view.appendChild(list);
    }

    var logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn btn-ghost btn-large';
    logoutBtn.style.marginTop = '24px';
    logoutBtn.textContent = 'ログアウト';
    logoutBtn.addEventListener('click', async function () {
      var ok = await UI().confirmSheet({
        title: 'ログアウトしますか？',
        body: 'この端末からログアウトします。次回は LINE 名と PIN の入力が必要です。',
        okLabel: 'ログアウトする'
      });
      if (!ok) { return; }
      Api().clearSession();
      try { window.localStorage.removeItem('vstars_line_name'); } catch (e) {}
      window.VstarsMemberApp.setHeaderUser('');
      window.location.hash = '#/login';
    });
    view.appendChild(logoutBtn);
  }

  window.VstarsMemberMyPage = { renderMyPage: renderMyPage };
})();
