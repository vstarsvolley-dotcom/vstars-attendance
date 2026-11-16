/* Vstars 出欠 — 管理: 練習管理
 * 練習の作成/編集/中止/復旧、定員変更、名簿・男女別人数、代理申込/代理キャンセル、
 * ウォークイン追加、出欠確定、出欠訂正、定期スケジュールルールと自動生成。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }

  function pid(p) { return p.practice_id || p.id; }

  // LINE 名 + 会員番号の選択肢を作る (list_member_names は LINE 名と会員番号のみ返す)
  async function fillMemberSelect(selectEl) {
    selectEl.innerHTML = '<option value="">選択してください</option>';
    try {
      var names = await Api().listMemberNames();
      (Array.isArray(names) ? names : []).forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = String(m.member_no !== undefined ? m.member_no : m.memberNo);
        opt.textContent = (m.line_name || m.lineName || '') + ' (No.' + opt.value + ')';
        selectEl.appendChild(opt);
      });
    } catch (e) {
      UI().toast('メンバー名簿を取得できませんでした。');
    }
  }

  function renderAdminPractices() {
    var view = App().adminHeader(viewEl(), 'practices', '練習管理');
    var toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    var createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-navy';
    createBtn.textContent = '＋ 練習を作成';
    createBtn.addEventListener('click', function () { showPracticeForm(view, null); });
    toolbar.appendChild(createBtn);
    view.appendChild(toolbar);

    var listWrap = document.createElement('div');
    view.appendChild(listWrap);
    refreshList(listWrap);

    var ruleSec = document.createElement('section');
    var ruleTitle = document.createElement('h2');
    ruleTitle.className = 'section-title';
    ruleTitle.textContent = '定期スケジュールルール';
    ruleSec.appendChild(ruleTitle);
    ruleSec.appendChild(buildRuleForm());
    ruleSec.appendChild(buildGenerateForm(listWrap));
    ruleSec.appendChild(buildDisableRuleForm());
    view.appendChild(ruleSec);
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

  function showPracticeForm(view, practice) {
    var isEdit = !!practice;
    var form = document.createElement('form');
    form.className = 'form practice-card';
    form.style.marginBottom = '16px';
    var title = document.createElement('h2');
    title.className = 'section-title';
    title.style.marginTop = '0';
    title.textContent = isEdit ? '練習を編集' : '練習を作成';
    form.appendChild(title);

    var dateI = fieldRow(form, '日付', inputOf('date', practice ? practice.practice_date : '', true));
    var startI = fieldRow(form, '開始時刻', inputOf('time', practice ? String(practice.start_time || '').slice(0, 5) : '', true));
    var endI = fieldRow(form, '終了時刻', inputOf('time', practice ? String(practice.end_time || '').slice(0, 5) : '', true));
    var venueI = fieldRow(form, '会場', inputOf('text', practice ? practice.venue : '', true));
    venueI.placeholder = '例: 亀田小学校 体育館';
    venueI.maxLength = 100;
    var capI = fieldRow(form, '定員', inputOf('number', practice ? (practice.capacity !== undefined ? practice.capacity : 18) : 18, true));
    capI.min = '1';
    capI.max = '100';

    var err = document.createElement('p');
    err.className = 'field-error';
    err.hidden = true;
    form.appendChild(err);

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy btn-large';
    submit.textContent = isEdit ? '保存' : '作成';
    form.appendChild(submit);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = '閉じる';
    closeBtn.addEventListener('click', function () { form.remove(); });
    form.appendChild(closeBtn);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      if (endI.value <= startI.value) {
        err.textContent = '終了時刻は開始時刻より後にしてください。';
        err.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        if (isEdit) {
          await Api().adminUpdatePractice(pid(practice), {
            date: dateI.value, startTime: startI.value, endTime: endI.value,
            venue: venueI.value.trim(), capacity: parseInt(capI.value, 10)
          });
          UI().toast('練習を更新しました。');
        } else {
          await Api().adminCreatePractice({
            date: dateI.value, startTime: startI.value, endTime: endI.value,
            venue: venueI.value.trim(), capacity: parseInt(capI.value, 10), ruleId: null
          });
          UI().toast('練習を作成しました。');
        }
        form.remove();
        renderAdminPractices();
      } catch (ex) {
        err.textContent = '保存できませんでした。' + (ex && ex.message ? ' ' + ex.message : '');
        err.hidden = false;
        submit.disabled = false;
      }
    });

    view.insertBefore(form, view.children[1] || null);
    dateI.focus();
  }

  async function refreshList(wrap) {
    wrap.innerHTML = '<p>読み込み中…</p>';
    var practices;
    try {
      practices = await Api().adminListPractices();
    } catch (e) {
      UI().showError(wrap, '練習一覧を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), function () { refreshList(wrap); });
      return;
    }
    var list = Array.isArray(practices) ? practices : [];
    list.sort(function (a, b) { return String(b.practice_date || '').localeCompare(String(a.practice_date || '')); });
    wrap.innerHTML = '';
    if (list.length === 0) {
      UI().showEmpty(wrap, '練習がありません。');
      return;
    }
    var container = document.createElement('div');
    container.className = 'practice-list';
    list.forEach(function (p) {
      container.appendChild(practiceCard(p, wrap));
    });
    wrap.appendChild(container);
  }

  function practiceCard(p, wrap) {
    var card = document.createElement('article');
    card.className = 'practice-card';
    var head = document.createElement('div');
    head.className = 'practice-head';
    var dateEl = document.createElement('div');
    dateEl.className = 'practice-date';
    dateEl.textContent = UI().fmtDateTimeJST(p.practice_date, p.start_time, p.end_time);
    head.appendChild(dateEl);
    if (p.is_cancelled) {
      var b = document.createElement('span');
      b.className = 'badge badge-red';
      b.textContent = '中止';
      head.appendChild(b);
    }
    if (p.attendance_finalized_at) {
      var f = document.createElement('span');
      f.className = 'badge badge-green';
      f.textContent = '出欠確定済み';
      head.appendChild(f);
    }
    card.appendChild(head);

    var venue = document.createElement('p');
    venue.className = 'practice-venue';
    venue.textContent = p.venue || '';
    card.appendChild(venue);

    var counts = document.createElement('p');
    counts.className = 'practice-counts';
    counts.textContent = '定員: ' + (p.capacity !== undefined ? p.capacity : 18) + '人'
      + (p.confirmed_count !== undefined ? '　確定 ' + p.confirmed_count + '人' : '')
      + (p.waitlist_count !== undefined && p.waitlist_count > 0 ? '　待ち ' + p.waitlist_count + '人' : '');
    card.appendChild(counts);

    var detail = document.createElement('div');
    card.appendChild(detail);

    var actions = document.createElement('div');
    actions.className = 'practice-actions';
    function addBtn(label, cls, fn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small ' + cls;
      btn.textContent = label;
      btn.addEventListener('click', fn);
      actions.appendChild(btn);
      return btn;
    }
    addBtn('名簿', 'btn-ghost', function () { showRoster(p, detail, wrap); });
    addBtn('編集', 'btn-ghost', function () { showPracticeForm(viewEl(), p); });
    if (p.is_cancelled) {
      addBtn('復旧', 'btn-ghost', async function () {
        try { await Api().adminRestorePractice(pid(p)); UI().toast('練習を復旧しました。'); renderAdminPractices(); }
        catch (e) { UI().toast('復旧できませんでした。' + (e && e.message ? ' ' + e.message : '')); }
      });
    } else {
      addBtn('中止', 'btn-cancel', async function () {
        var ok = await UI().confirmSheet({
          title: '練習を中止しますか？',
          body: UI().fmtDateTimeJST(p.practice_date, p.start_time, p.end_time) + ' ' + (p.venue || '') + ' を中止します。申込者全員がキャンセル扱いになります。',
          okLabel: '中止する', danger: true
        });
        if (!ok) { return; }
        try { await Api().adminCancelPractice(pid(p), '管理者による中止'); UI().toast('練習を中止しました。'); renderAdminPractices(); }
        catch (e) { UI().toast('中止できませんでした。' + (e && e.message ? ' ' + e.message : '')); }
      });
    }
    addBtn('定員変更', 'btn-ghost', function () { changeCapacity(p, detail, wrap); });
    addBtn('代理申込', 'btn-ghost', function () { proxyApplyForm(p, detail, wrap); });
    addBtn('ウォークイン追加', 'btn-ghost', function () { walkinForm(p, detail, wrap); });
    addBtn('出欠確定', 'btn-navy', async function () {
      var ok = await UI().confirmSheet({
        title: '出欠を確定しますか？',
        body: '確定したメンバーは出席扱いになります。あとから出欠訂正で修正できます。',
        okLabel: '確定する'
      });
      if (!ok) { return; }
      try { await Api().adminFinalizeAttendance(pid(p)); UI().toast('出欠を確定しました。'); renderAdminPractices(); }
      catch (e) { UI().toast('出欠確定に失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
    });
    addBtn('出欠訂正', 'btn-ghost', function () { correctForm(p, detail, wrap); });
    card.appendChild(actions);
    return card;
  }

  async function showRoster(p, detail, wrap) {
    detail.innerHTML = '<p>読み込み中…</p>';
    try {
      var roster = await Api().adminGetPracticeRoster(pid(p));
      var rows = Array.isArray(roster) ? roster : [];
      var counts = null;
      try {
        var gc = await Api().adminPracticeGenderCounts(pid(p));
        counts = Array.isArray(gc) ? gc[0] : gc;
      } catch (e) { /* 任意 */ }
      detail.innerHTML = '';
      if (counts) {
        var cp = document.createElement('p');
        cp.className = 'muted';
        cp.textContent = '確定の男女別: 男 ' + (counts.male || 0) + '・女 ' + (counts.female || 0)
          + '・その他 ' + (counts.other || 0) + '・回答しない ' + (counts.prefer_not_to_say || 0);
        detail.appendChild(cp);
      }
      if (rows.length === 0) {
        detail.innerHTML += '<p>申込者はいません。</p>';
        return;
      }
      var table = document.createElement('div');
      table.className = 'table-wrap';
      var html = '<table class="data"><thead><tr><th>LINE名</th><th>No.</th><th>状態</th><th></th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var st = r.status || '';
        var label = st === 'confirmed' ? '確定' : st === 'waitlisted' ? ('待ち' + (r.waitlist_position ? r.waitlist_position + '番目' : '')) : st === 'walkin' ? 'ウォークイン' : (st || '—');
        html += '<tr><td>' + UI().esc(r.line_name || '-') + '</td><td>' + UI().esc(r.member_no !== undefined ? r.member_no : '-') + '</td><td>' + UI().esc(label) + '</td>';
        html += '<td>' + (r.registration_id ? '<button type="button" class="btn btn-cancel btn-small" data-reg="' + UI().esc(r.registration_id) + '">代理キャンセル</button>' : '') + '</td></tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
      detail.appendChild(table);
      table.querySelectorAll('[data-reg]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await UI().confirmSheet({
            title: '代理キャンセルしますか？',
            body: 'この申込を管理者としてキャンセルします。',
            okLabel: 'キャンセルする', danger: true
          });
          if (!ok) { return; }
          try {
            await Api().adminProxyCancel(btn.getAttribute('data-reg'), '管理者による代理キャンセル');
            UI().toast('代理キャンセルしました。');
            refreshList(wrap);
          } catch (e) { UI().toast('代理キャンセルに失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
      });
    } catch (e) {
      detail.innerHTML = '<p class="danger-text">名簿を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
    }
  }

  function changeCapacity(p, detail, wrap) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var cur = p.capacity !== undefined ? p.capacity : 18;
    var input = fieldRow(form, '新しい定員（現在 ' + cur + '人）', inputOf('number', cur, true));
    input.min = '1';
    input.max = '100';
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = '定員を減らすと、確定が遅い順に待ちに戻ります。';
    form.appendChild(note);
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '定員を変更';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var next = parseInt(input.value, 10);
      if (next < cur) {
        var ok = await UI().confirmSheet({
          title: '定員を減らしますか？',
          body: '定員を ' + cur + '人から ' + next + '人に減らすと、確定が遅い順にメンバーが待ちに戻ります。',
          okLabel: '減らす', danger: true
        });
        if (!ok) { return; }
      }
      try {
        await Api().adminChangeCapacity(pid(p), next);
        UI().toast('定員を変更しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('定員変更に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
    input.focus();
  }

  function proxyApplyForm(p, detail, wrap) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var sel = document.createElement('select');
    sel.required = true;
    fieldRow(form, 'メンバー', sel);
    fillMemberSelect(sel);
    var reason = fieldRow(form, '理由（必須）', inputOf('text', '', true));
    reason.placeholder = '例: 本人の代わりに電話で申込';
    reason.maxLength = 200;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '代理で申し込む';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminProxyApply(pid(p), parseInt(sel.value, 10), reason.value.trim());
        UI().toast('代理申込しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('代理申込に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  function walkinForm(p, detail, wrap) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var sel = document.createElement('select');
    sel.required = true;
    fieldRow(form, 'メンバー（当日参加）', sel);
    fillMemberSelect(sel);
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = 'ウォークインを追加';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminAddWalkin(pid(p), parseInt(sel.value, 10));
        UI().toast('ウォークインを追加しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('追加に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  function correctForm(p, detail, wrap) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    var sel = document.createElement('select');
    sel.required = true;
    fieldRow(form, 'メンバー', sel);
    fillMemberSelect(sel);
    var resSel = document.createElement('select');
    resSel.required = true;
    resSel.innerHTML = '<option value="present">出席</option><option value="absent">欠席</option>';
    fieldRow(form, '結果', resSel);
    var reason = fieldRow(form, '理由（必須）', inputOf('text', '', true));
    reason.maxLength = 200;
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '出欠を訂正';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminCorrectAttendance(pid(p), parseInt(sel.value, 10), resSel.value, reason.value.trim());
        UI().toast('出欠を訂正しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('訂正に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    detail.appendChild(form);
  }

  function buildRuleForm() {
    var form = document.createElement('form');
    form.className = 'form practice-card';
    var weekdays = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
    var wdSel = document.createElement('select');
    wdSel.required = true;
    weekdays.forEach(function (w, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = w;
      wdSel.appendChild(o);
    });
    wdSel.value = '2'; // 火曜
    fieldRow(form, '曜日', wdSel);
    var ivSel = document.createElement('select');
    ivSel.required = true;
    [['1', '毎週'], ['2', '隔週']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      ivSel.appendChild(o);
    });
    fieldRow(form, '間隔', ivSel);
    var anchor = fieldRow(form, '基準日（曜日と一致すること）', inputOf('date', '', true));
    var start = fieldRow(form, '開始時刻', inputOf('time', '', true));
    var end = fieldRow(form, '終了時刻', inputOf('time', '', true));
    var venue = fieldRow(form, '会場', inputOf('text', '', true));
    venue.maxLength = 100;
    var cap = fieldRow(form, '定員', inputOf('number', 18, true));
    cap.min = '1';
    cap.max = '100';
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = 'ルールを作成';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminCreateScheduleRule({
          weekday: parseInt(wdSel.value, 10), intervalWeeks: parseInt(ivSel.value, 10),
          anchorDate: anchor.value, startTime: start.value, endTime: end.value,
          venue: venue.value.trim(), capacity: parseInt(cap.value, 10)
        });
        UI().toast('ルールを作成しました。');
        form.reset();
        wdSel.value = '2';
        cap.value = '18';
      } catch (ex) { UI().toast('ルールの作成に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    return form;
  }

  function buildGenerateForm(listWrap) {
    var form = document.createElement('form');
    form.className = 'form practice-card';
    var t = document.createElement('h3');
    t.textContent = '練習を自動生成';
    form.appendChild(t);
    var from = fieldRow(form, '開始日', inputOf('date', '', true));
    var to = fieldRow(form, '終了日', inputOf('date', '', true));
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '指定期間の練習を生成';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await Api().adminGeneratePractices(from.value, to.value);
        UI().toast('練習を生成しました。');
        refreshList(listWrap);
      } catch (ex) { UI().toast('生成に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    return form;
  }

  function buildDisableRuleForm() {
    var form = document.createElement('form');
    form.className = 'form practice-card';
    var t = document.createElement('h3');
    t.textContent = 'ルールを無効化';
    form.appendChild(t);
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = '無効化するルールを一覧から選んでください。';
    form.appendChild(note);
    var select = document.createElement('select');
    select.required = true;
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'ルールを読み込み中…';
    select.appendChild(opt0);
    fieldRow(form, 'ルール', select);
    Api().adminListScheduleRules().then(function (rows) {
      select.innerHTML = '';
      var list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        var o = document.createElement('option');
        o.value = ''; o.textContent = '有効なルールはありません';
        select.appendChild(o); return;
      }
      var wd = ['日', '月', '火', '水', '木', '金', '土'];
      list.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.rule_id || r.id;
        o.textContent = (wd[r.weekday] || r.weekday) + '曜 ' + (r.interval_weeks === 2 ? '隔週' : '毎週') + ' ' + (r.start_time || '').slice(0, 5) + '〜' + (r.end_time || '').slice(0, 5) + ' ' + r.venue + (r.is_active ? '' : '（無効）');
        select.appendChild(o);
      });
    }).catch(function () {
      select.innerHTML = '';
      var o = document.createElement('option');
      o.value = ''; o.textContent = 'ルール一覧の読み込みに失敗しました';
      select.appendChild(o);
    });
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-cancel';
    submit.textContent = 'ルールを無効化';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var ok = await UI().confirmSheet({
        title: 'ルールを無効化しますか？',
        body: 'このルールからは今後練習が生成されなくなります。すでに生成済みの練習は残ります。',
        okLabel: '無効化する', danger: true
      });
      if (!ok) { return; }
      try {
        await Api().adminDisableScheduleRule(select.value);
        UI().toast('ルールを無効化しました。');
        form.reset();
      } catch (ex) { UI().toast('無効化に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
    });
    return form;
  }

  window.VstarsAdminPractices = { renderAdminPractices: renderAdminPractices };
})();
