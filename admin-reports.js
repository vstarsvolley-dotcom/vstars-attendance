/* Vstars 出欠 — 管理: 集計・出力 (レポート)
 * 月次統計、出欠 CSV / メンバー CSV ダウンロード、メール送信状況、
 * 管理者管理、メール通知設定。
 * オーナー限定のボタン (メンバー CSV、管理者管理) は非オーナーには描画しない。
 * ルートは admin-app.js に合わせる (#/admin/reports)。
 * 通知設定は #/admin/settings ルートが admin-app.js にないため、
 * このレポート画面内の「設定」セクションに置く。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }

  function addBtn(parent, label, cls, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + cls;
    btn.textContent = label;
    btn.addEventListener('click', fn);
    parent.appendChild(btn);
    return btn;
  }

  function section(title) {
    var s = document.createElement('section');
    s.className = 'practice-card';
    s.style.marginBottom = '16px';
    var h = document.createElement('h2');
    h.className = 'section-title';
    h.style.marginTop = '0';
    h.textContent = title;
    s.appendChild(h);
    return s;
  }

  async function renderAdminReports() {
    var view = App().adminHeader(viewEl(), 'reports', '集計・出力');
    var isOwner = false;
    if (window.VstarsAdminMembers && window.VstarsAdminMembers.getIsOwner) {
      isOwner = await window.VstarsAdminMembers.getIsOwner();
    }
    var now = new Date();

    /* ---- 月次統計 ---- */
    var statsSec = section('月次統計');
    var statsForm = document.createElement('form');
    statsForm.className = 'form';
    function numField(labelText, value, min, max) {
      var div = document.createElement('div');
      div.className = 'field';
      var label = document.createElement('label');
      label.textContent = labelText;
      div.appendChild(label);
      var input = document.createElement('input');
      input.type = 'number';
      input.value = String(value);
      input.min = String(min);
      input.max = String(max);
      input.required = true;
      div.appendChild(input);
      statsForm.appendChild(div);
      return input;
    }
    var yearI = numField('年', now.getFullYear(), 2020, 2100);
    var monthI = numField('月', now.getMonth() + 1, 1, 12);
    var showBtn = document.createElement('button');
    showBtn.type = 'submit';
    showBtn.className = 'btn btn-navy';
    showBtn.textContent = '表示';
    statsForm.appendChild(showBtn);
    statsSec.appendChild(statsForm);
    var statsResult = document.createElement('div');
    statsResult.innerHTML = '<p>年月を選んで表示してください。</p>';
    statsSec.appendChild(statsResult);
    statsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var year = parseInt(yearI.value, 10);
      var month = parseInt(monthI.value, 10);
      statsResult.innerHTML = '<p>読み込み中…</p>';
      try {
        var st = await Api().adminMonthlyStats(year, month);
        // admin_monthly_stats は集計オブジェクト1件を返す
        // { year, month, practices_held, confirmed_slots, present, attendance_rate }。
        // 配列ではないため、Array.isArray 判定では常に「データなし」になっていた。
        if (!st || typeof st !== 'object') {
          statsResult.innerHTML = '<p>この月のデータはありません。</p>';
          return;
        }
        var held = st.practices_held !== undefined ? st.practices_held : 0;
        var slots = st.confirmed_slots !== undefined ? st.confirmed_slots : 0;
        var present = st.present !== undefined ? st.present : 0;
        var rate = (st.attendance_rate !== undefined && st.attendance_rate !== null)
          ? Math.round(st.attendance_rate * 100) + '%' : '-';
        statsResult.innerHTML = '<div class="stat-grid">'
          + '<div class="stat-card"><p class="stat-label">開催回数</p><p class="stat-value">' + UI().esc(held) + '</p></div>'
          + '<div class="stat-card"><p class="stat-label">確定枠</p><p class="stat-value">' + UI().esc(slots) + '</p></div>'
          + '<div class="stat-card"><p class="stat-label">出席数</p><p class="stat-value">' + UI().esc(present) + '</p></div>'
          + '<div class="stat-card"><p class="stat-label">出席率</p><p class="stat-value">' + UI().esc(rate) + '</p></div>'
          + '</div>'
          + '<p class="stat-sub">出席数 ÷ 確定枠（中止を除く。休会中の月は除く）</p>';
      } catch (e) {
        statsResult.innerHTML = '<p class="danger-text">月次統計を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
      }
    });
    view.appendChild(statsSec);

    /* ---- CSV ダウンロード ---- */
    var csvSec = section('CSV ダウンロード');
    var csvActions = document.createElement('div');
    csvActions.className = 'practice-actions';
    addBtn(csvActions, '出欠 CSV をダウンロード', 'btn-ghost', async function () {
      var y = parseInt(yearI.value, 10);
      var m = parseInt(monthI.value, 10);
      try {
        var csv = await Api().adminExportAttendanceCsv(y, m);
        UI().csvDownload('vstars_attendance_' + y + '-' + String(m).padStart(2, '0') + '.csv', typeof csv === 'string' ? csv : String(csv || ''));
        UI().toast('出欠 CSV をダウンロードしました。');
      } catch (ex) { UI().toast('ダウンロードに失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    // メンバー CSV はオーナーのみ (ボタン自体を描画しない)
    if (isOwner) {
      addBtn(csvActions, 'メンバー CSV をダウンロード (オーナーのみ)', 'btn-ghost', async function () {
        try {
          var csv = await Api().adminExportMembersCsv();
          UI().csvDownload('vstars_members.csv', typeof csv === 'string' ? csv : String(csv || ''));
          UI().toast('メンバー CSV をダウンロードしました。');
        } catch (ex) { UI().toast('ダウンロードに失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
      });
    }
    csvSec.appendChild(csvActions);
    view.appendChild(csvSec);

    /* ---- メール送信状況 ---- */
    var mailSec = section('メール送信状況');
    var mailStatus = document.createElement('div');
    mailStatus.innerHTML = '<p>読み込み中…</p>';
    mailSec.appendChild(mailStatus);
    var outboxEl = document.createElement('div');
    outboxEl.innerHTML = '<p>読み込み中…</p>';
    mailSec.appendChild(outboxEl);
    view.appendChild(mailSec);
    try {
      var st = await Api().adminMailStatus();
      var s = Array.isArray(st) ? st[0] : st;
      mailStatus.innerHTML = '';
      var mp = document.createElement('p');
      mp.textContent = s
        ? ('本日の送信数: ' + (s.sent_today !== undefined ? s.sent_today : (s.today_sent !== undefined ? s.today_sent : '—'))
          + ' / 上限 100件' + (s.last_sent_at ? '　最終送信: ' + s.last_sent_at : ''))
        : 'メール状況を取得できませんでした。';
      mailStatus.appendChild(mp);
    } catch (e) {
      mailStatus.innerHTML = '<p class="danger-text">メール状況を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
    }
    async function refreshOutbox() {
      var rows;
      try {
        rows = await Api().adminListMailOutbox();
      } catch (e) {
        outboxEl.innerHTML = '<p class="danger-text">送信待ち一覧を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
        return;
      }
      rows = Array.isArray(rows) ? rows : [];
      outboxEl.innerHTML = '';
      if (rows.length === 0) {
        outboxEl.innerHTML = '<p>送信待ち・失敗のメールはありません。</p>';
        return;
      }
      rows.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'my-reg-item';
        var t = document.createElement('p');
        t.style.margin = '0 0 8px';
        t.textContent = (r.subject || '-') + ' — 状態: ' + (r.status || '-') + ' ｜ 試行: ' + (r.attempts !== undefined ? r.attempts : 0) + '回'
          + (r.created_at ? ' ｜ 作成: ' + UI().fmtDateTimeJST(r.created_at) : '')
          + (r.error ? ' ｜ エラー: ' + r.error : '');
        item.appendChild(t);
        if (r.status === 'failed') {
          var retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'btn btn-ghost btn-small';
          retryBtn.textContent = '再送する';
          retryBtn.addEventListener('click', async function () {
            try {
              await Api().adminRetryMail(r.outbox_id);
              UI().toast('再送をキューに入れました。');
              refreshOutbox();
            } catch (e) { UI().toast('再送に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
          });
          item.appendChild(retryBtn);
        }
        outboxEl.appendChild(item);
      });
    }
    refreshOutbox();

    /* ---- 管理者管理 (オーナーのみ) ---- */
    if (isOwner) {
      var adminSec = section('管理者管理 (オーナーのみ)');
      var adminListEl = document.createElement('div');
      adminListEl.innerHTML = '<p>読み込み中…</p>';
      adminSec.appendChild(adminListEl);
      view.appendChild(adminSec);
      refreshAdmins();
      async function refreshAdmins() {
        var rows;
        try {
          rows = await Api().adminListAdmins();
        } catch (e) {
          adminListEl.innerHTML = '<p class="danger-text">管理者一覧を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
          return;
        }
        rows = Array.isArray(rows) ? rows : [];
        var html = '<div class="table-wrap"><table class="data"><thead><tr><th>LINE名</th><th>No.</th><th>権限</th><th></th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr><td>' + UI().esc(r.line_name || '-') + '</td><td>' + UI().esc(r.member_no !== undefined ? r.member_no : '-') + '</td><td>' +
            UI().esc(r.role === 'owner' ? 'オーナー' : '管理者') + '</td><td>' +
            (r.role !== 'owner' ? '<button type="button" class="btn btn-cancel btn-small" data-member="' + UI().esc(r.member_no) + '">権限を外す</button>' : '') +
            '</td></tr>';
        });
        html += '</tbody></table></div>';
        adminListEl.innerHTML = html;
        adminListEl.querySelectorAll('[data-member]').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var ok = await UI().confirmSheet({ title: '管理者権限を外しますか？', body: 'このメンバーは管理画面にログインできなくなります。', okLabel: '権限を外す', danger: true });
            if (!ok) { return; }
            try {
              await Api().adminRevokeAdmin(parseInt(btn.getAttribute('data-member'), 10));
              UI().toast('管理者権限を外しました。');
              refreshAdmins();
            } catch (e) { UI().toast('権限の取消に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
          });
        });
        var grantForm = document.createElement('form');
        grantForm.className = 'form';
        var gt = document.createElement('h3');
        gt.textContent = '管理者を追加';
        grantForm.appendChild(gt);
        var noDiv = document.createElement('div');
        noDiv.className = 'field';
        var noLabel = document.createElement('label');
        noLabel.textContent = '会員番号';
        noDiv.appendChild(noLabel);
        var noInput = document.createElement('input');
        noInput.type = 'number';
        noInput.required = true;
        noInput.min = '1';
        noDiv.appendChild(noInput);
        grantForm.appendChild(noDiv);
        var roleDiv = document.createElement('div');
        roleDiv.className = 'field';
        var roleLabel = document.createElement('label');
        roleLabel.textContent = '権限';
        roleDiv.appendChild(roleLabel);
        var roleSel = document.createElement('select');
        roleSel.required = true;
        roleSel.innerHTML = '<option value="admin">管理者</option><option value="owner">オーナー</option>';
        roleDiv.appendChild(roleSel);
        grantForm.appendChild(roleDiv);
        var grantBtn = document.createElement('button');
        grantBtn.type = 'submit';
        grantBtn.className = 'btn btn-navy';
        grantBtn.textContent = '付与する';
        grantForm.appendChild(grantBtn);
        grantForm.addEventListener('submit', async function (e) {
          e.preventDefault();
          try {
            await Api().adminGrantAdmin(parseInt(noInput.value, 10), roleSel.value);
            UI().toast('管理者権限を付与しました。');
            refreshAdmins();
          } catch (ex) { UI().toast('付与に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
        });
        adminListEl.appendChild(grantForm);
      }
    }

    /* ---- 設定: メール通知 ---- */
    var settingsSec = section('設定');
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = '繰り上げ・待ち戻しの通知メールを自分のメールアドレスで受け取るかどうかを設定します。初期値は ON です。';
    settingsSec.appendChild(note);
    var notifyForm = document.createElement('form');
    notifyForm.className = 'form';
    var chkLabel = document.createElement('label');
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;
    chkLabel.appendChild(chk);
    chkLabel.appendChild(document.createTextNode(' 通知メールを受け取る'));
    notifyForm.appendChild(chkLabel);
    var saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-navy';
    saveBtn.textContent = '保存';
    notifyForm.appendChild(saveBtn);
    notifyForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().setMyEmailNotify(chk.checked);
        UI().toast('通知設定を保存しました。');
      } catch (ex) { UI().toast('保存に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    settingsSec.appendChild(notifyForm);
    var about = document.createElement('p');
    about.textContent = 'Vstars 出欠管理 — 管理画面。定員は既定 18名です。';
    settingsSec.appendChild(about);
    view.appendChild(settingsSec);
  }

  window.VstarsAdminReports = { renderAdminReports: renderAdminReports };
})();
