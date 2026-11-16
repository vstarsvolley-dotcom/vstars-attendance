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
      if (list.length === 0) {
        var p = document.createElement('p');
        p.textContent = '参加者はまだいません。';
        body.appendChild(p);
        return;
      }
      var confirmed = document.createElement('ul');
      confirmed.className = 'roster-list';
      var waitlist = document.createElement('ul');
      waitlist.className = 'roster-list';
      list.forEach(function (r) {
        var name = r.line_name || r.lineName || r.name || '';
        var st = r.status || r.my_status || 'confirmed';
        var li = document.createElement('li');
        var nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        li.appendChild(nameSpan);
        var stSpan = document.createElement('span');
        stSpan.className = 'badge ' + (st === 'waitlisted' || st === '待ち' ? 'badge-yellow' : 'badge-green');
        stSpan.textContent = (st === 'waitlisted' || st === '待ち')
          ? ('待ち' + (r.waitlist_position ? r.waitlist_position + '番目' : '')) : '確定';
        li.appendChild(stSpan);
        if (st === 'waitlisted' || st === '待ち') { waitlist.appendChild(li); }
        else { confirmed.appendChild(li); }
      });
      if (confirmed.children.length > 0) {
        var h1 = document.createElement('h3');
        h1.textContent = '確定（' + confirmed.children.length + '名）';
        body.appendChild(h1);
        body.appendChild(confirmed);
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
