/* Vstars 出欠 — カレンダー画面 (会員側)
 * 月表示のカレンダー。練習がある日に種別色のドットを付け、
 * 日をタップするとその日の練習・練習試合・大会の一覧が出て、
 * そこから申込・キャンセル・参加者確認ができる。
 * データは list_practices_for_month (SQL 17) で月単位に取得する。
 */
'use strict';

(function () {
  var curYear = 0;
  var curMonth = 0;
  var selectedDate = '';
  var monthCache = [];

  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function practiceId(p) { return String(p.practice_id || p.id || ''); }

  function todayParts() {
    var t = UI().jstTodayStr().split('-');
    return { year: parseInt(t[0], 10), month: parseInt(t[1], 10), day: parseInt(t[2], 10) };
  }

  function shiftMonth(dy, dm) {
    var y = curYear;
    var m = curMonth + dm + dy * 12;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    curYear = y;
    curMonth = m;
    selectedDate = '';
    renderCalendar();
  }

  function renderCalendar() {
    var view = viewEl();
    if (!view) { return; }
    var t = todayParts();
    if (!curYear) {
      curYear = t.year;
      curMonth = t.month;
      selectedDate = UI().jstTodayStr();
    }
    UI().showLoading(view, 'カレンダーを読み込み中…');
    Api().listPracticesForMonth(curYear, curMonth).then(function (rows) {
      monthCache = Array.isArray(rows) ? rows : [];
      drawCalendar(view);
    }).catch(function (e) {
      UI().showError(view, 'カレンダーを読み込めませんでした。' + (e && e.message ? ' ' + e.message : ''), renderCalendar);
    });
  }

  function drawCalendar(view) {
    view.innerHTML = '';
    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = 'カレンダー';
    view.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'view-lead';
    lead.textContent = '練習がある日に色のドットが付きます。日をタップすると、その日の練習・練習試合・大会が出ます。';
    view.appendChild(lead);

    // 月送り
    var nav = document.createElement('div');
    nav.className = 'calendar-nav';
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-ghost btn-small';
    prevBtn.textContent = '‹ 前月';
    prevBtn.addEventListener('click', function () { shiftMonth(0, -1); });
    var monthLabel = document.createElement('span');
    monthLabel.className = 'cal-month';
    monthLabel.textContent = UI().fmtMonthJST(curYear, curMonth);
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-ghost btn-small';
    nextBtn.textContent = '次月 ›';
    nextBtn.addEventListener('click', function () { shiftMonth(0, 1); });
    var todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'btn btn-ghost btn-small';
    todayBtn.textContent = '今月';
    todayBtn.addEventListener('click', function () {
      var tt = todayParts();
      curYear = tt.year;
      curMonth = tt.month;
      selectedDate = UI().jstTodayStr();
      renderCalendar();
    });
    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);
    nav.appendChild(todayBtn);
    view.appendChild(nav);

    // 凡例 (種別の色)
    var legend = document.createElement('p');
    legend.className = 'muted cal-legend';
    legend.innerHTML = '<span class="cal-dot cal-dot-practice"></span> 練習　'
      + '<span class="cal-dot cal-dot-match"></span> 練習試合　'
      + '<span class="cal-dot cal-dot-tournament"></span> 大会';
    view.appendChild(legend);

    // 日付 → 練習の一覧
    var days = {};
    monthCache.forEach(function (p) {
      var key = String(p.practice_date || p.date || '').slice(0, 10);
      if (!key) { return; }
      if (!days[key]) { days[key] = []; }
      days[key].push(p);
    });

    var grid = UI().renderCalendarGrid({
      year: curYear,
      month: curMonth,
      days: days,
      selectedDate: selectedDate,
      onSelect: function (dateStr) {
        selectedDate = dateStr;
        drawCalendar(view);
      }
    });
    view.appendChild(grid);

    // 選択した日の一覧
    var daySec = document.createElement('div');
    daySec.className = 'cal-day-list';
    if (!selectedDate) {
      var hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = '日をタップすると、その日の練習が出ます。';
      daySec.appendChild(hint);
    } else {
      var h = document.createElement('h2');
      h.className = 'section-title';
      h.textContent = UI().fmtDateJST(selectedDate) + ' の予定';
      daySec.appendChild(h);
      var list = days[selectedDate] || [];
      if (list.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'この日は練習・試合・大会がありません。';
        daySec.appendChild(empty);
      } else {
        var listEl = document.createElement('div');
        listEl.className = 'practice-list';
        list.forEach(function (p) {
          // カレンダーの当日一覧ではまとめ申し込みのチェックボックスは出さない
          // (onToggleSelect を渡さない)。
          var card = UI().renderPracticeCard(p, {
            onApply: function (pr) { applyOne(pr); },
            onCancel: function (pr) { cancelOne(pr); },
            onRoster: function (pr) { showRoster(pr); }
          });
          listEl.appendChild(card);
        });
        daySec.appendChild(listEl);
      }
    }
    view.appendChild(daySec);
    window.VstarsMemberApp.refreshBanner();
  }

  async function applyOne(practice) {
    var id = practiceId(practice);
    var dateText = UI().fmtDateTimeJST(
      practice.practice_date || practice.date, practice.start_time, practice.end_time);
    try {
      await Api().applyPractice(id);
      UI().toast(dateText + ' に申し込みました。');
      renderCalendar();
    } catch (e) {
      UI().toast('申し込めませんでした。' + UI().friendlyError(e));
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
      renderCalendar();
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

  window.VstarsMemberCalendar = { renderCalendar: renderCalendar };
})();
