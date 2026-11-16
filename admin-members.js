/* Vstars 出欠 — 管理: メンバー管理 / 登録申請 / 退会候補
 * 検索、編集、PIN リセット、デバイス取消、常連化、LINE グループ参加日、
 * 休会の追加/終了、登録申請の承認/却下、退会候補の保留/確定。
 * 生年月日はオーナーのみ表示・編集する (非オーナーには項目自体を描画しない)。
 * オーナー限定のボタン (退会の確定、管理者管理) は非オーナーには描画しない。
 * owner 判定は admin_list_admins と現在の Auth セッションの照合で行う。
 * ルートは admin-app.js に合わせる: #/admin/members, #/admin/requests, #/admin/withdrawals。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }

  var _isOwnerCache = null;

  // オーナーかどうかを判定する (結果をページ内でキャッシュする)。
  // 照合できない場合は非オーナー扱いにする (権限の最終判断は DB 関数側)。
  async function getIsOwner() {
    if (_isOwnerCache !== null) { return _isOwnerCache; }
    _isOwnerCache = false;
    try {
      var session = await Api().getAdminSession();
      var user = session && session.user;
      if (!user) { return false; }
      var admins = await Api().adminListAdmins();
      var rows = Array.isArray(admins) ? admins : [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var same = (r.auth_user_id && r.auth_user_id === user.id) ||
          (r.email && user.email && r.email === user.email);
        if (same && (r.role === 'owner' || r.is_owner === true)) { _isOwnerCache = true; break; }
      }
    } catch (e) { _isOwnerCache = false; }
    return _isOwnerCache;
  }

  function statusLabel(m) {
    if (m.is_withdrawn) { return '退会済み'; }
    if (m.regular_since) { return '既存'; }
    return '新規';
  }

  function fieldRow(form, labelText, input) {
    var div = document.createElement('div');
    div.className = 'field';
    var label = document.createElement('label');
    label.textContent = labelText;
    div.appendChild(label);
    div.appendChild(input);
    form.appendChild(div);
    return input;
  }

  function inputOf(type, value, required) {
    var i = document.createElement('input');
    i.type = type;
    if (value !== undefined && value !== null) { i.value = value; }
    if (required) { i.required = true; }
    return i;
  }

  function addBtn(parent, label, cls, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small ' + cls;
    btn.textContent = label;
    btn.addEventListener('click', fn);
    parent.appendChild(btn);
    return btn;
  }

  /* ---------- メンバー一覧・編集 ---------- */

  async function renderAdminMembers() {
    var view = App().adminHeader(viewEl(), 'members', 'メンバー管理');
    var isOwner = await getIsOwner();

    var link = document.createElement('p');
    var a = document.createElement('a');
    a.href = '#/admin/withdrawals';
    a.textContent = '退会候補一覧を見る →';
    link.appendChild(a);
    view.appendChild(link);

    var searchForm = document.createElement('form');
    searchForm.className = 'form';
    var q = fieldRow(searchForm, 'メンバー検索 (LINE名 / 本名)', inputOf('search', '', false));
    q.placeholder = 'LINE名または本名で検索';
    var searchBtn = document.createElement('button');
    searchBtn.type = 'submit';
    searchBtn.className = 'btn btn-navy';
    searchBtn.textContent = '検索';
    searchForm.appendChild(searchBtn);
    view.appendChild(searchForm);

    var listEl = document.createElement('div');
    view.appendChild(listEl);

    async function refreshList(query) {
      listEl.innerHTML = '<p>読み込み中…</p>';
      var members;
      try {
        members = await Api().adminListMembers(query || '');
      } catch (e) {
        UI().showError(listEl, 'メンバー一覧を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), function () { refreshList(query); });
        return;
      }
      members = Array.isArray(members) ? members : [];
      listEl.innerHTML = '';
      if (members.length === 0) {
        UI().showEmpty(listEl, '該当するメンバーはいません。');
        return;
      }
      members.forEach(function (m) {
        var card = document.createElement('div');
        card.className = 'practice-card';
        var h = document.createElement('h3');
        h.textContent = (m.line_name || '-') + ' (No.' + (m.member_no !== undefined ? m.member_no : '-') + ')';
        card.appendChild(h);
        var p = document.createElement('p');
        p.textContent = '性別: ' + UI().genderLabel(m.gender) + ' ｜ ステータス: ' + statusLabel(m)
          + (m.on_leave ? ' ｜ 休会中' : '')
          + (m.age !== undefined && m.age !== null ? ' ｜ 年齢: ' + m.age + '歳' : '')
          + (m.volleyball_position ? ' ｜ ポジション: ' + UI().positionLabel(m.volleyball_position) : '')
          + (m.volleyball_experience ? ' ｜ バレー歴: ' + m.volleyball_experience : '')
          + (m.line_group_joined_date ? ' ｜ LINEグループ参加: ' + UI().fmtDateJST(m.line_group_joined_date) : '');
        card.appendChild(p);
        var detail = document.createElement('div');
        card.appendChild(detail);
        var actions = document.createElement('div');
        actions.className = 'practice-actions';
        addBtn(actions, '編集', 'btn-ghost', function () { showEditForm(m, detail, isOwner, function () { refreshList(q.value.trim()); }); });
        addBtn(actions, 'PINリセット', 'btn-ghost', async function () {
          var ok = await UI().confirmSheet({ title: 'PINをリセットしますか？', body: 'このメンバーの PIN が無効になり、次回ログイン時に新しい PIN の設定が必要になります。', okLabel: 'リセットする', danger: true });
          if (!ok) { return; }
          try { await Api().adminResetPin(m.member_no); UI().toast('PINをリセットしました。'); }
          catch (e) { UI().toast('PINリセットに失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
        addBtn(actions, 'デバイス取消', 'btn-ghost', async function () {
          var ok = await UI().confirmSheet({ title: 'デバイスをすべて取消しますか？', body: 'このメンバーに紐づく全デバイスの紐づけが解除され、次回は PIN での再認証が必要になります。', okLabel: '取消する', danger: true });
          if (!ok) { return; }
          try { await Api().adminRevokeDevices(m.member_no); UI().toast('デバイスを取消しました。'); }
          catch (e) { UI().toast('デバイス取消に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
        addBtn(actions, '常連にする', 'btn-ghost', function () { showRegularForm(m, detail, function () { refreshList(q.value.trim()); }); });
        addBtn(actions, 'LINE参加日を設定', 'btn-ghost', function () { showLineJoinedForm(m, detail, function () { refreshList(q.value.trim()); }); });
        addBtn(actions, '休会', 'btn-ghost', function () { showLeave(m, detail, function () { refreshList(q.value.trim()); }); });
        card.appendChild(actions);
        listEl.appendChild(card);
      });
    }

    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      refreshList(q.value.trim());
    });
    refreshList('');
  }

  function showEditForm(m, detail, isOwner, onDone) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var t = document.createElement('h3');
    t.textContent = 'メンバー編集';
    form.appendChild(t);
    var realI = fieldRow(form, '本名', inputOf('text', m.real_name || '', true));
    realI.maxLength = 100;
    var lineI = fieldRow(form, 'LINE名', inputOf('text', m.line_name || '', true));
    lineI.maxLength = 100;
    var genderSel = document.createElement('select');
    genderSel.required = true;
    [['male', '男'], ['female', '女'], ['other', 'その他'], ['prefer_not_to_say', '回答しない']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      if (m.gender === kv[0]) { o.selected = true; }
      genderSel.appendChild(o);
    });
    fieldRow(form, '性別', genderSel);
    // 生年月日フィールドはオーナーの場合のみ描画する
    var birthI = null;
    if (isOwner) {
      birthI = fieldRow(form, '生年月日', inputOf('date', m.birth_date || '', false));
    }
    var ageI = fieldRow(form, '年齢', inputOf('number', (m.age !== undefined && m.age !== null) ? String(m.age) : '', false));
    ageI.min = '0';
    ageI.max = '120';
    var expI = fieldRow(form, 'バレー歴', inputOf('text', m.volleyball_experience || '', false, '例: 高校3年・大学サークル2年'));
    expI.maxLength = 500;
    var posBox = document.createElement('div');
    posBox.className = 'checkbox-group';
    var posChecks = [];
    var curPos = Array.isArray(m.volleyball_position) ? m.volleyball_position
      : (m.volleyball_position ? [m.volleyball_position] : []);
    [['setter', 'セッター'], ['outside', 'レフト'], ['middle', 'センター'], ['opposite', 'ライト'], ['libero', 'リベロ'], ['undecided', '未定']].forEach(function (kv) {
      var lab = document.createElement('label');
      lab.className = 'checkbox-item';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = kv[0];
      cb.checked = curPos.indexOf(kv[0]) >= 0;
      cb.addEventListener('change', function () {
        if (cb.value === 'undecided' && cb.checked) {
          posChecks.forEach(function (c) { if (c !== cb) { c.checked = false; } });
        } else if (cb.checked) {
          posChecks.forEach(function (c) { if (c.value === 'undecided') { c.checked = false; } });
        }
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(kv[1]));
      posBox.appendChild(lab);
      posChecks.push(cb);
    });
    fieldRow(form, 'ポジション', posBox);
    var noteI = document.createElement('textarea');
    noteI.value = m.admin_note || '';
    noteI.maxLength = 500;
    fieldRow(form, '管理者メモ', noteI);
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '保存';
    form.appendChild(submit);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = '閉じる';
    closeBtn.addEventListener('click', function () { detail.innerHTML = ''; });
    form.appendChild(closeBtn);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminUpdateMember(m.member_no, {
          realName: realI.value.trim(), lineName: lineI.value.trim(), gender: genderSel.value,
          // 非オーナーは生年月日を送らない。SQL 側は COALESCE(p_birth_date, birth_date) で
          // 既存値を維持すること (直書きすると消えてしまうため。未検証の前提。README 参照)。
          birthDate: isOwner ? (birthI && birthI.value ? birthI.value : null) : null,
          adminNote: noteI.value.trim(),
          age: ageI.value === '' ? null : parseInt(ageI.value, 10),
          volleyballExperience: expI.value.trim(),
          position: (function () { var v = posChecks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); return v.length ? v : null; })()
        });
        UI().toast('メンバーを更新しました。');
        detail.innerHTML = '';
        if (onDone) { onDone(); }
      } catch (ex) { UI().toast('更新に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  function showRegularForm(m, detail, onDone) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var t = document.createElement('h3');
    t.textContent = '常連にする';
    form.appendChild(t);
    var reasonSel = document.createElement('select');
    reasonSel.required = true;
    [['attendance', '出席回数'], ['line_group', 'LINEグループ参加'], ['manual', '手動']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      reasonSel.appendChild(o);
    });
    fieldRow(form, '理由', reasonSel);
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '常連にする';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminMarkRegular(m.member_no, reasonSel.value);
        UI().toast('常連にしました。');
        detail.innerHTML = '';
        if (onDone) { onDone(); }
      } catch (ex) { UI().toast('常連化に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  function showLineJoinedForm(m, detail, onDone) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var t = document.createElement('h3');
    t.textContent = 'LINEグループ参加日を設定';
    form.appendChild(t);
    var dateI = fieldRow(form, '参加日', inputOf('date', m.line_group_joined_date || '', true));
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '保存';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminSetLineGroupJoined(m.member_no, dateI.value);
        UI().toast('LINEグループ参加日を設定しました。');
        detail.innerHTML = '';
        if (onDone) { onDone(); }
      } catch (ex) { UI().toast('設定に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  async function showLeave(m, detail, onDone) {
    detail.innerHTML = '<p>読み込み中…</p>';
    var leaves;
    try {
      leaves = await Api().adminListLeaves(m.member_no);
    } catch (e) {
      detail.innerHTML = '<p class="danger-text">休会一覧を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
      return;
    }
    leaves = Array.isArray(leaves) ? leaves : [];
    detail.innerHTML = '';
    var t = document.createElement('h3');
    t.textContent = '休会';
    detail.appendChild(t);
    if (leaves.length === 0) {
      var none = document.createElement('p');
      none.textContent = '休会の記録はありません。';
      detail.appendChild(none);
    }
    leaves.forEach(function (lv) {
      var p = document.createElement('p');
      p.textContent = UI().fmtDateJST(lv.start_date) + ' 〜 ' + (lv.end_date ? UI().fmtDateJST(lv.end_date) : '継続中')
        + ' (' + (lv.reason || '-') + ')';
      detail.appendChild(p);
      if (!lv.end_date) {
        var endBtn = document.createElement('button');
        endBtn.type = 'button';
        endBtn.className = 'btn btn-ghost btn-small';
        endBtn.textContent = '休会を終了';
        endBtn.addEventListener('click', async function () {
          try {
            await Api().adminEndLeave(lv.leave_id);
            UI().toast('休会を終了しました。');
            if (onDone) { onDone(); }
          } catch (e) { UI().toast('休会の終了に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
        detail.appendChild(endBtn);
      }
    });
    var form = document.createElement('form');
    form.className = 'form';
    var startI = fieldRow(form, '開始日', inputOf('date', '', true));
    var endI = fieldRow(form, '終了日 (未定の場合は空欄)', inputOf('date', '', false));
    var reasonI = fieldRow(form, '理由', inputOf('text', '', false));
    reasonI.placeholder = '例: 仕事が忙しいため';
    reasonI.maxLength = 200;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '休会を追加';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminAddLeave(m.member_no, startI.value, endI.value || null, reasonI.value.trim());
        UI().toast('休会を追加しました。');
        detail.innerHTML = '';
        if (onDone) { onDone(); }
      } catch (ex) { UI().toast('休会の追加に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  /* ---------- 登録申請 ---------- */

  async function renderRegistrationRequests() {
    var view = App().adminHeader(viewEl(), 'requests', '登録申請');
    var listEl = document.createElement('div');
    view.appendChild(listEl);
    async function refresh() {
      listEl.innerHTML = '<p>読み込み中…</p>';
      var rows;
      try {
        rows = await Api().adminListRegistrationRequests();
      } catch (e) {
        UI().showError(listEl, '登録申請を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), refresh);
        return;
      }
      rows = (Array.isArray(rows) ? rows : []).filter(function (r) { return !r.status || r.status === 'pending'; });
      listEl.innerHTML = '';
      if (rows.length === 0) {
        UI().showEmpty(listEl, '承認待ちの申請はありません。');
        return;
      }
      rows.forEach(function (r) {
        var card = document.createElement('div');
        card.className = 'practice-card';
        var h = document.createElement('h3');
        h.textContent = (r.line_name || '') + ' (' + UI().genderLabel(r.gender) + ')';
        card.appendChild(h);
        var p = document.createElement('p');
        p.textContent = '本名: ' + (r.real_name || '-') + ' / 申請日: ' + UI().fmtDateTimeJST(r.consent_at)
          + (r.age !== undefined && r.age !== null ? ' / 年齢: ' + r.age + '歳' : '')
          + (r.volleyball_position ? ' / ポジション: ' + UI().positionLabel(r.volleyball_position) : '')
          + (r.volleyball_experience ? ' / バレー歴: ' + r.volleyball_experience : '');
        card.appendChild(p);
        var actions = document.createElement('div');
        actions.className = 'practice-actions';
        addBtn(actions, '承認', 'btn-navy', async function () {
          try {
            await Api().adminApproveRequest(r.request_id);
            UI().toast('承認しました。メンバー一覧に表示されるようになります。');
            refresh();
          } catch (e) { UI().toast('承認に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
        addBtn(actions, '却下', 'btn-cancel', async function () {
          var ok = await UI().confirmSheet({ title: '申請を却下しますか？', body: '却下した申請は 90 日後に削除されます。', okLabel: '却下する', danger: true });
          if (!ok) { return; }
          try {
            await Api().adminRejectRequest(r.request_id, '管理者による却下');
            UI().toast('却下しました。');
            refresh();
          } catch (e) { UI().toast('却下に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
        card.appendChild(actions);
        listEl.appendChild(card);
      });
    }
    refresh();
  }

  /* ---------- 退会候補 ---------- */

  async function renderWithdrawals() {
    var view = App().adminHeader(viewEl(), 'withdrawals', '退会候補');
    var isOwner = await getIsOwner();
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = '一定期間参加がないメンバーが表示されます。保留にすると指定日まで候補から外れます。退会の確定はオーナーのみ行えます。';
    view.appendChild(note);
    var listEl = document.createElement('div');
    view.appendChild(listEl);
    async function refresh() {
      listEl.innerHTML = '<p>読み込み中…</p>';
      var rows;
      try {
        rows = await Api().adminListWithdrawalCandidates();
      } catch (e) {
        UI().showError(listEl, '退会候補を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), refresh);
        return;
      }
      rows = Array.isArray(rows) ? rows : [];
      listEl.innerHTML = '';
      if (rows.length === 0) {
        UI().showEmpty(listEl, '退会候補はいません。');
        return;
      }
      rows.forEach(function (r) {
        var card = document.createElement('div');
        card.className = 'practice-card';
        var h = document.createElement('h3');
        h.textContent = (r.line_name || '-') + ' (No.' + (r.member_no !== undefined ? r.member_no : '-') + ')';
        card.appendChild(h);
        var p = document.createElement('p');
        p.textContent = '最終参加: ' + (r.last_attended_at ? UI().fmtDateJST(r.last_attended_at) : '参加記録なし')
          + (r.months_inactive !== undefined ? ' ｜ 不参加: 約' + r.months_inactive + 'か月' : '')
          + (r.hold_until ? ' ｜ 保留中: ' + UI().fmtDateJST(r.hold_until) + 'まで' : '');
        card.appendChild(p);
        var detail = document.createElement('div');
        card.appendChild(detail);
        var actions = document.createElement('div');
        actions.className = 'practice-actions';
        addBtn(actions, '保留にする', 'btn-ghost', function () { showHoldForm(r, detail, refresh); });
        // 退会の確定ボタンはオーナーの場合のみ描画する
        if (isOwner) {
          addBtn(actions, '退会を確定する', 'btn-cancel', async function () {
            var ok = await UI().confirmSheet({
              title: '退会を確定しますか？',
              body: '退会が確定すると、このメンバーのデータは 1 年後に削除されます。削除されるまでデータは残ります。この操作は取り消せません。',
              okLabel: '退会を確定する', danger: true
            });
            if (!ok) { return; }
            try {
              await Api().adminConfirmWithdrawal(r.member_no, '管理者による退会確定');
              UI().toast('退会を確定しました。');
              refresh();
            } catch (e) { UI().toast('退会の確定に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
          });
        }
        card.appendChild(actions);
        listEl.appendChild(card);
      });
    }
    refresh();
  }

  function showHoldForm(r, detail, onDone) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var t = document.createElement('h3');
    t.textContent = '退会候補を保留';
    form.appendChild(t);
    var untilI = fieldRow(form, '保留期限', inputOf('date', '', true));
    var noteI = fieldRow(form, 'メモ', inputOf('text', '', false));
    noteI.placeholder = '例: 本人に確認中';
    noteI.maxLength = 200;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '保留する';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminHoldWithdrawal(r.member_no, untilI.value, noteI.value.trim());
        UI().toast('保留にしました。');
        detail.innerHTML = '';
        if (onDone) { onDone(); }
      } catch (ex) { UI().toast('保留に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  window.VstarsAdminMembers = {
    renderAdminMembers: renderAdminMembers,
    renderRegistrationRequests: renderRegistrationRequests,
    renderWithdrawals: renderWithdrawals,
    getIsOwner: getIsOwner
  };
})();
