/* Vstars 出欠 — 練習一覧画面
 * list_practices → カード表示。56px の申し込むボタン、確認シート付きキャンセル、
 * チェックボックス複数選択 + 下部バーでまとめ申し込み、参加者表示 (LINE 名のみ)。
 */
'use strict';

(function () {
  var selected = new Set();
  var practicesCache = [];
  // 一覧の切替: 'upcoming' (今後の練習) / 'past' (過去の練習)。既定は今後。
  // 過去タブは list_past_practices() を呼ぶ (SQL 21: 申込んだ人だけ見える)。
  var tab = 'upcoming';

  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function practiceId(p) { return String(p.practice_id || p.id || ''); }

  function updateBulkBar() {
    var bar = document.getElementById('bulk-bar');
    var countEl = document.getElementById('bulk-count');
    var btn = document.getElementById('bulk-apply-btn');
    if (!bar || !countEl || !btn) { return; }
    if (selected.size === 0) { bar.hidden = true; return; }
    bar.hidden = false;
    countEl.textContent = selected.size + '件選択中';
    btn.textContent = 'まとめ申し込む（' + selected.size + '件）';
  }

  function renderPractices() {
    var view = viewEl();
    if (!view) { return; }
    selected = new Set();
    updateBulkBar();
    UI().showLoading(view, '練習を読み込み中…');
    var load = tab === 'past' ? Api().listPastPractices() : Api().listPractices();
    load.then(function (rows) {
      practicesCache = Array.isArray(rows) ? rows : [];
      drawList(view);
      window.VstarsMemberApp.refreshBanner();
    }).catch(function (e) {
      UI().showError(view, '練習を読み込めませんでした。' + (e && e.message ? ' ' + e.message : ''), renderPractices);
    });
  }

  function drawList(view) {
    view.innerHTML = '';
    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = '練習一覧';
    view.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'view-lead';
    lead.textContent = tab === 'past'
      ? '参加した過去の練習です。動画リンクがある練習は「動画を見る」から見られます。'
      : '申し込みたい練習を選んでください。定員を超えた場合は待ちになります。';
    view.appendChild(lead);

    var calLink = document.createElement('p');
    calLink.className = 'view-link';
    var calA = document.createElement('a');
    calA.href = '#/calendar';
    calA.textContent = 'カレンダーで見る →';
    calLink.appendChild(calA);
    view.appendChild(calLink);

    // 今後の練習 / 過去の練習の切替タブ (SQL 21)。
    var tabRow = document.createElement('div');
    tabRow.className = 'toolbar';
    [['upcoming', '今後の練習'], ['past', '過去の練習']].forEach(function (def) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-small ' + (tab === def[0] ? 'btn-navy' : 'btn-ghost');
      b.textContent = def[1];
      b.addEventListener('click', function () {
        if (tab === def[0]) { return; }
        tab = def[0];
        renderPractices();
      });
      tabRow.appendChild(b);
    });
    view.appendChild(tabRow);

    if (practicesCache.length === 0) {
      // 空のメッセージは一覧の枠の中だけに出す。view 全体に showEmpty すると
      // タイトル・切替タブごと消えて「今後の練習」に戻れなくなるため (2026-11-17 修正)。
      var emptyWrap = document.createElement('div');
      emptyWrap.className = 'practice-list';
      UI().showEmpty(emptyWrap, tab === 'past' ? '参加した過去の練習がありません。' : '申し込める練習がありません。');
      view.appendChild(emptyWrap);
      return;
    }

    var list = document.createElement('div');
    list.className = 'practice-list';
    practicesCache.forEach(function (p) {
      // 過去タブは申込・キャンセル・まとめ申し込みを出さない (カード側でも
      // 過去分は申込ボタンを出さない)。参加者表示と動画リンクは出る。
      var card = UI().renderPracticeCard(p, tab === 'past' ? {
        onRoster: function (pr) { showRoster(pr); }
      } : {
        selected: selected,
        onToggleSelect: function (id, checked) {
          if (checked) { selected.add(String(id)); } else { selected.delete(String(id)); }
          updateBulkBar();
        },
        onApply: function (pr) { applyOne(pr); },
        onCancel: function (pr) { cancelOne(pr); },
        onRoster: function (pr) { showRoster(pr); }
      });
      list.appendChild(card);
    });
    view.appendChild(list);
    updateBulkBar();

    var bulkBtn = document.getElementById('bulk-apply-btn');
    if (bulkBtn) {
      bulkBtn.onclick = applyBulk;
    }
  }

  async function applyOne(practice) {
    var id = practiceId(practice);
    var dateText = UI().fmtDateTimeJST(
      practice.practice_date || practice.date, practice.start_time, practice.end_time);
    try {
      await Api().applyPractice(id);
      UI().toast(dateText + ' に申し込みました。');
      renderPractices();
    } catch (e) {
      UI().toast('申し込めませんでした。' + UI().friendlyError(e));
    }
  }

  async function applyBulk() {
    if (selected.size === 0) { return; }
    var ids = Array.from(selected);
    var ok = await UI().confirmSheet({
      title: 'まとめ申し込み',
      body: ids.length + '件の練習に申し込みます。よろしいですか？',
      okLabel: '申し込む'
    });
    if (!ok) { return; }
    try {
      var res = await Api().applyBulk(ids);
      var results = (res && res.results) || [];
      var okCount = 0;
      var failMsgs = [];
      results.forEach(function (r) {
        if (r && r.ok) { okCount++; }
        else if (r) { failMsgs.push(UI().friendlyError({ message: r.error || '', code: r.error || '' })); }
      });
      // 旧版の応答 (results なし) は全件成功扱い。
      if (results.length === 0) { okCount = ids.length; }
      if (failMsgs.length === 0) {
        UI().toast(okCount + '件申し込みました。');
      } else if (okCount === 0) {
        UI().toast('申し込めませんでした。' + failMsgs[0]);
      } else {
        UI().toast(okCount + '件申し込みました。' + failMsgs.length + '件失敗しました。' + failMsgs[0]);
      }
      renderPractices();
    } catch (e) {
      UI().toast('まとめ申し込みに失敗しました。' + UI().friendlyError(e));
      renderPractices();
    }
  }

  async function cancelOne(practice) {
    var regId = practice.my_registration_id || practice.registration_id;
    if (!regId) { return; }
    var dateText = UI().fmtDateTimeJST(
      practice.practice_date || practice.date, practice.start_time, practice.end_time);
    var ok = await UI().confirmSheet({
      title: 'キャンセルしますか？',
      body: dateText + ' ' + (practice.venue || '') + ' の申し込みをキャンセルします。待ちの方がいる場合は繰り上がります。',
      okLabel: 'キャンセルする',
      danger: true
    });
    if (!ok) { return; }
    try {
      await Api().cancelRegistration(regId);
      UI().toast('キャンセルしました。');
      renderPractices();
    } catch (e) {
      UI().toast('キャンセルできませんでした。' + UI().friendlyError(e));
    }
  }

  async function showRoster(practice) {
    var id = practiceId(practice);
    var dateText = UI().fmtDateTimeJST(
      practice.practice_date || practice.date, practice.start_time, practice.end_time);
    var body = document.createElement('div');
    body.innerHTML = '<p>読み込み中…</p>';
    var close = UI().openSheet(dateText + ' ' + (practice.venue || ''), body, [
      { label: '閉じる', className: 'btn-navy', onClick: function () { close(); } }
    ]);
    try {
      var rows = await Api().getPracticeRoster(id);
      var list = Array.isArray(rows) ? rows : (rows && rows.roster ? rows.roster : []);
      body.innerHTML = '';
      // v18: 自分のチームを表示する (get_my_team)。未割当の場合は出さない。
      // 名簿のチーム別グループ化は下の confirmedByTeam で行う
      // (get_practice_roster の team_no を使用。SQL 22 で追加)。
      try {
        var teamRows = await Api().getMyTeam(id);
        if (Array.isArray(teamRows) && teamRows.length > 0) {
          var t = teamRows[0];
          var teamP = document.createElement('p');
          teamP.className = 'my-team';
          teamP.textContent = 'あなたは ' + (t.team_label || UI().teamLabel(t.team_no)) + 'です。';
          body.appendChild(teamP);
          if (t.stale) {
            var teamWarn = document.createElement('p');
            teamWarn.className = 'danger-text';
            teamWarn.textContent = '申込が変わっています。再分けしてください。';
            body.appendChild(teamWarn);
          }
        }
      } catch (e2) { /* チームが取れなくても名簿は表示する */ }
      if (list.length === 0) {
        var p = document.createElement('p');
        p.textContent = '参加者はまだいません。';
        body.appendChild(p);
        return;
      }
      var waitlist = document.createElement('ul');
      waitlist.className = 'roster-list';
      // v18: 確定者はチーム別に表示する (get_practice_roster の team_no)。
      // チーム分けがない場合は従来通り「確定」としてまとめて表示する。
      var confirmedByTeam = { 1: [], 2: [], 3: [], unassigned: [] };
      var hasTeams = false;
      function rosterLi(r, showStatus) {
        var name = r.line_name || r.lineName || r.name || '';
        var st = r.status || r.my_status || 'confirmed';
        var li = document.createElement('li');
        var nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        li.appendChild(nameSpan);
        if (showStatus) {
          var stSpan = document.createElement('span');
          stSpan.className = 'badge ' + (st === 'waitlisted' || st === '待ち' ? 'badge-yellow' : 'badge-green');
          stSpan.textContent = (st === 'waitlisted' || st === '待ち')
            ? ('待ち' + (r.waitlist_position ? r.waitlist_position + '番目' : '')) : '確定';
          li.appendChild(stSpan);
        }
        return li;
      }
      function appendRosterSection(title, rows) {
        if (!rows || rows.length === 0) { return; }
        var h = document.createElement('h3');
        h.textContent = title + '（' + rows.length + '名）';
        body.appendChild(h);
        var ul = document.createElement('ul');
        ul.className = 'roster-list';
        rows.forEach(function (r) { ul.appendChild(rosterLi(r, false)); });
        body.appendChild(ul);
      }
      list.forEach(function (r) {
        var st = r.status || r.my_status || 'confirmed';
        if (st === 'waitlisted' || st === '待ち') { waitlist.appendChild(rosterLi(r, true)); return; }
        var tn = r.team_no || r.teamNo || null;
        if (tn === 1 || tn === 2 || tn === 3) { hasTeams = true; confirmedByTeam[tn].push(r); }
        else { confirmedByTeam.unassigned.push(r); }
      });
      if (hasTeams) {
        [1, 2, 3].forEach(function (tn) {
          appendRosterSection(UI().teamLabel(tn), confirmedByTeam[tn]);
        });
        appendRosterSection('未割当', confirmedByTeam.unassigned);
      } else {
        appendRosterSection('確定', confirmedByTeam[1].concat(
          confirmedByTeam[2], confirmedByTeam[3], confirmedByTeam.unassigned));
      }
      if (waitlist.children.length > 0) {
        var h2 = document.createElement('h3');
        h2.textContent = '待ち（' + waitlist.children.length + '名）';
        body.appendChild(h2);
        body.appendChild(waitlist);
      }
    } catch (e) {
      body.innerHTML = '';
      var err = document.createElement('p');
      err.textContent = '参加者を読み込めませんでした。' + (e && e.message ? ' ' + e.message : '');
      body.appendChild(err);
    }
  }

  window.VstarsMemberPractices = {
    renderPractices: renderPractices,
    clearSelection: function () { selected = new Set(); updateBulkBar(); }
  };
})();
