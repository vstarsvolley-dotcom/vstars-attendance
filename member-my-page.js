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
      ['年齢', (page.age !== undefined && page.age !== null) ? String(page.age) + '歳' : '—'],
      ['バレー歴', page.volleyball_experience || page.volleyballExperience || '—'],
      ['ポジション', UI().positionLabel(page.volleyball_position || '')],
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
        var kindText = r.kind ? '［' + UI().kindLabel(r.kind) + '］' : '';
        d.textContent = kindText + UI().fmtDateTimeJST(date, r.start_time, r.end_time) + ' ' + (r.venue || '');
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

    // プッシュ通知 (繰り上がり/待ち戻りのお知らせ)
    renderPushSection(view);

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
      // サーバー側でデバイスを取り消してから (C13) ローカルセッションを消す。
      // Api().logout() は RPC が失敗してもローカルセッションを消す。
      await Api().logout();
      try { window.localStorage.removeItem('vstars_line_name'); } catch (e) {}
      window.VstarsMemberApp.setHeaderUser('');
      window.location.hash = '#/login';
    });
    view.appendChild(logoutBtn);
  }

  // ---- プッシュ通知の登録/解除 ----
  // 対応ブラウザのみ表示する。iPhone はホーム画面に追加した PWA でのみ
  // 届く (iOS 16.4+)。LINE 内ブラウザでは届かないため、その旨も表示する。
  function pushSupported() {
    return ('serviceWorker' in window.navigator)
      && ('PushManager' in window)
      && ('Notification' in window)
      && !!(window.VSTARS_CONFIG && window.VSTARS_CONFIG.VAPID_PUBLIC_KEY);
  }

  function isLineBrowser() {
    var ua = (window.navigator && window.navigator.userAgent) || '';
    return /Line\//i.test(ua);
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
    return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function renderPushSection(view) {
    var sec = document.createElement('h2');
    sec.className = 'section-title';
    sec.textContent = 'プッシュ通知';
    view.appendChild(sec);

    var box = document.createElement('div');
    box.className = 'push-box';
    view.appendChild(box);

    if (!pushSupported()) {
      var ng = document.createElement('p');
      ng.className = 'muted';
      ng.textContent = 'このブラウザはプッシュ通知に対応していません。Safari / Chrome で開き直してください。';
      box.appendChild(ng);
      return;
    }

    if (isLineBrowser()) {
      var line = document.createElement('p');
      line.className = 'muted';
      line.textContent = 'LINE の中で開いている場合は通知が届きません。Safari / Chrome で開いてホーム画面に追加してください。';
      box.appendChild(line);
    }

    var status = document.createElement('p');
    status.className = 'muted';
    status.textContent = '確認中…';
    box.appendChild(status);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-navy';
    btn.style.marginTop = '8px';
    btn.disabled = true;
    box.appendChild(btn);

    var reg;
    try {
      reg = await window.navigator.serviceWorker.ready;
    } catch (e) {
      status.textContent = 'サービスワーカーが使えません。';
      return;
    }
    var sub = null;
    try { sub = await reg.pushManager.getSubscription(); } catch (e) { sub = null; }

    function refresh() {
      if (sub) {
        status.textContent = '通知を受け取る設定になっています。繰り上がり・待ち戻りのときにお知らせします。';
        btn.textContent = '通知を止める';
      } else if (window.Notification.permission === 'denied') {
        status.textContent = '通知がブロックされています。ブラウザの設定から許可してください。';
        btn.textContent = '通知を受け取る';
      } else {
        status.textContent = '繰り上がり・待ち戻りのとき、この端末に通知を送ります。';
        btn.textContent = '通知を受け取る';
      }
      btn.disabled = false;
    }
    refresh();

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        if (sub) {
          try { await sub.unsubscribe(); } catch (e) {}
          try { await Api().deletePushSubscription(sub.endpoint); } catch (e) {}
          sub = null;
          UI().toast('プッシュ通知を止めました。');
        } else {
          var perm = await window.Notification.requestPermission();
          if (perm !== 'granted') {
            UI().toast('通知が許可されませんでした。');
            refresh();
            return;
          }
          var newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(window.VSTARS_CONFIG.VAPID_PUBLIC_KEY)
          });
          try {
            var key = newSub.getKey('p256dh');
            var authKey = newSub.getKey('auth');
            await Api().savePushSubscription(
              newSub.endpoint,
              key ? arrayBufferToBase64(key) : '',
              authKey ? arrayBufferToBase64(authKey) : '');
          } catch (saveErr) {
            // サーバーへの保存に失敗したのにブラウザ側の購読だけ残すと
            // 通知が届かない「幽霊購読」になるため、購読を破棄する。
            try { await newSub.unsubscribe(); } catch (e2) {}
            throw saveErr;
          }
          sub = newSub;
          UI().toast('プッシュ通知を受け取る設定にしました。');
        }
      } catch (e) {
        UI().toast('プッシュ通知の設定に失敗しました。' + UI().friendlyError(e));
      }
      refresh();
    });
  }

  window.VstarsMemberMyPage = { renderMyPage: renderMyPage };
})();
