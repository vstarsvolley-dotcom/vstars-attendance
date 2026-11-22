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

  // 管理カレンダーの表示状態 (一覧/カレンダー切替)。
  var calMode = 'list';
  // 一覧の表示範囲: 'upcoming' (今後の練習) / 'past' (開催済み) / 'all' (すべて)。
  // 既定は今後の練習。過去分は開催済みに分ける (2026-11-17 ユーザー要望)。
  var listFilter = 'upcoming';
  var filterBtns = {};
  var calYear = 0;
  var calMonth = 0;
  var calSelected = '';
  var adminCache = [];

  // LINE 名 + 会員番号の選択肢を作る (list_member_names は LINE 名と会員番号のみ返す)
  // メンバー選択肢を埋める。members を渡すとその一覧 (絞り込み済み) で埋め、
  // 省略時は admin_list_members から現役メンバーを取得する (SQL 27)。
  // 特徴メモ・ユニフォーム購入の情報が要るため、名簿専用の
  // list_member_names ではなく管理者用一覧を使う。
  async function fillMemberSelect(selectEl, members) {
    var rows = members;
    if (!rows) {
      try {
        var all = await Api().adminListMembers('');
        rows = (Array.isArray(all) ? all : []).filter(function (m) {
          return m && m.status !== 'withdrawn' && !m.is_withdrawn;
        });
      } catch (e) {
        UI().toast('メンバー名簿を取得できませんでした。');
        rows = [];
      }
    }
    selectEl.innerHTML = '<option value="">選択してください</option>';
    (Array.isArray(rows) ? rows : []).forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = String(m.member_no !== undefined ? m.member_no : m.memberNo);
      opt.textContent = (m.line_name || m.lineName || '') + ' (No.' + opt.value + ')'
        + (m.uniform_purchased ? '・ユニフォーム済' : '');
      selectEl.appendChild(opt);
    });
  }

  function renderAdminPractices() {
    var view = App().adminHeader(viewEl(), 'practices', '練習管理');

    // v18: 明日のリマインドを手動で送る (pg_cron のフォールバック)。
    // 送信済みの練習はスキップされるため、送ったあとは 0 件になる。
    var remindSec = document.createElement('div');
    remindSec.className = 'practice-card';
    var remindBtn = document.createElement('button');
    remindBtn.type = 'button';
    remindBtn.className = 'btn btn-navy';
    remindBtn.textContent = '明日のリマインドを送る';
    remindSec.appendChild(remindBtn);
    var remindResult = document.createElement('p');
    remindResult.className = 'muted';
    remindResult.textContent = 'まだ送っていません。毎日 18:00 に自動で送られます。';
    remindSec.appendChild(remindResult);
    remindBtn.addEventListener('click', async function () {
      remindBtn.disabled = true;
      remindResult.textContent = '送信中…';
      try {
        var res = await Api().adminSendReminders();
        var practices = res && res.practices !== undefined ? res.practices : 0;
        var reminded = res && res.reminded !== undefined ? res.reminded : 0;
        remindResult.textContent = practices + '件の練習、' + reminded + '人にリマインドを送りました。'
          + (practices === 0 ? '（すでに送信済みの場合は 0 件になります。明日の練習がない場合も 0 件です。）' : '');
        UI().toast(practices + '件の練習、' + reminded + '人にリマインドを送りました。');
      } catch (e) {
        remindResult.textContent = '送信できませんでした。' + UI().friendlyError(e);
        UI().toast('リマインドを送れませんでした。' + UI().friendlyError(e));
      }
      remindBtn.disabled = false;
    });
    view.appendChild(remindSec);

    var toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    var createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-navy';
    createBtn.textContent = '＋ 練習を作成';
    createBtn.addEventListener('click', function () { showPracticeForm(view, null); });
    toolbar.appendChild(createBtn);
    var listBtn = document.createElement('button');
    listBtn.type = 'button';
    listBtn.className = 'btn btn-ghost btn-small';
    listBtn.textContent = '一覧';
    var calBtn = document.createElement('button');
    calBtn.type = 'button';
    calBtn.className = 'btn btn-ghost btn-small';
    calBtn.textContent = 'カレンダー';
    toolbar.appendChild(listBtn);
    toolbar.appendChild(calBtn);
    view.appendChild(toolbar);

    // 一覧の表示範囲 (今後の練習 / 開催済み / すべて)。一覧表示のときだけ使う。
    var filterRow = document.createElement('div');
    filterRow.className = 'toolbar';
    [['upcoming', '今後の練習'], ['past', '開催済み'], ['all', 'すべて']].forEach(function (def) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-small ' + (listFilter === def[0] ? 'btn-navy' : 'btn-ghost');
      b.textContent = def[1];
      b.addEventListener('click', function () {
        listFilter = def[0];
        calMode = 'list';
        updateFilterButtons();
        showView();
      });
      filterBtns[def[0]] = b;
      filterRow.appendChild(b);
    });
    view.appendChild(filterRow);

    function updateFilterButtons() {
      Object.keys(filterBtns).forEach(function (key) {
        filterBtns[key].className = 'btn btn-small ' + (listFilter === key ? 'btn-navy' : 'btn-ghost');
      });
    }

    var listWrap = document.createElement('div');
    view.appendChild(listWrap);

    function showView() {
      listBtn.setAttribute('aria-pressed', calMode === 'list' ? 'true' : 'false');
      calBtn.setAttribute('aria-pressed', calMode === 'calendar' ? 'true' : 'false');
      if (calMode === 'calendar') { renderAdminCalendar(listWrap); }
      else { refreshList(listWrap); }
    }
    listBtn.addEventListener('click', function () { calMode = 'list'; showView(); });
    calBtn.addEventListener('click', function () { calMode = 'calendar'; showView(); });
    showView();

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
    // ブラウザ標準の min チェックだと定員0などが無言で止まるため、
    // JS 側のチェック (定員メッセージ) を必ず通す (E2-3(2))。
    form.noValidate = true;
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

    // 種別 (SQL 17)。試合・大会のときだけ男女別定員を出す。
    var kindSel = document.createElement('select');
    [['practice', '練習'], ['match', '練習試合'], ['tournament', '大会']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      kindSel.appendChild(o);
    });
    kindSel.value = practice ? (practice.kind || 'practice') : 'practice';
    fieldRow(form, '種別', kindSel);
    var capMenI = fieldRow(form, '男性マックス', inputOf('number',
      practice && practice.capacity_men !== undefined && practice.capacity_men !== null ? practice.capacity_men : 6, true));
    capMenI.min = '1';
    capMenI.max = '100';
    var capWomenI = fieldRow(form, '女性マックス', inputOf('number',
      practice && practice.capacity_women !== undefined && practice.capacity_women !== null ? practice.capacity_women : 6, true));
    capWomenI.min = '1';
    capWomenI.max = '100';
    var capRow = capI.closest('.field');
    var capMenRow = capMenI.closest('.field');
    var capWomenRow = capWomenI.closest('.field');
    // 公開/非公開 (SQL 19)。試合・大会のときだけ出す。練習は常に公開で
    // 選択肢を出さない。既定は公開。
    var visSel = document.createElement('select');
    [['public', '公開（全員に見える）'], ['private', '非公開（招待した人だけ）']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      visSel.appendChild(o);
    });
    visSel.value = practice && practice.visibility === 'private' ? 'private' : 'public';
    var visRow = fieldRow(form, '公開範囲', visSel);
    function toggleGenderCaps() {
      var gendered = kindSel.value === 'match' || kindSel.value === 'tournament';
      if (capRow) { capRow.hidden = gendered; }
      if (capMenRow) { capMenRow.hidden = !gendered; }
      if (capWomenRow) { capWomenRow.hidden = !gendered; }
      if (visRow) { visRow.hidden = !gendered; }
    }
    kindSel.addEventListener('change', toggleGenderCaps);
    toggleGenderCaps();

    // 動画リンク (SQL 21): YouTube プレイリスト等の URL。任意。練習・試合・大会すべてで使える。
    var videoI = fieldRow(form, '動画リンク（YouTube プレイリスト）', inputOf('url', practice ? (practice.video_url || '') : ''));
    videoI.placeholder = 'https://www.youtube.com/playlist?list=…';
    videoI.maxLength = 500;

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
      var kind = kindSel.value;
      var isGendered = kind === 'match' || kind === 'tournament';
      // 動画リンク (SQL 21): 空欄はなし。http(s) 以外はサーバーでも弾くが、
      // ここでも先に日本語で伝える。
      var videoUrl = (videoI.value || '').trim();
      if (videoUrl !== '' && videoUrl.indexOf('http://') !== 0 && videoUrl.indexOf('https://') !== 0) {
        err.textContent = '動画リンクは http:// または https:// で始まる URL を入力してください。';
        err.hidden = false;
        return;
      }
      var cap = null;
      var capMen = null;
      var capWomen = null;
      if (isGendered) {
        capMen = parseInt(capMenI.value, 10);
        capWomen = parseInt(capWomenI.value, 10);
        if (!capMen || capMen < 1 || capMen > 100 || !capWomen || capWomen < 1 || capWomen > 100) {
          err.textContent = '男性マックス・女性マックスは1〜100人で入力してください。';
          err.hidden = false;
          return;
        }
      } else {
        cap = parseInt(capI.value, 10);
        if (!cap || cap < 1 || cap > 100) {
          err.textContent = '定員は1〜100人で入力してください。';
          err.hidden = false;
          return;
        }
      }
      submit.disabled = true;
      try {
        if (isEdit) {
          await Api().adminUpdatePractice(pid(practice), {
            date: dateI.value, startTime: startI.value, endTime: endI.value,
            venue: venueI.value.trim(), capacity: cap,
            kind: kind, capacityMen: capMen, capacityWomen: capWomen,
            visibility: isGendered ? visSel.value : 'public',
            // 空文字をそのまま渡す (SQL 21: 空文字はリンクのクリア。null は既存値維持)。
            videoUrl: videoUrl
          });
          UI().toast('練習を更新しました。');
        } else {
          await Api().adminCreatePractice({
            date: dateI.value, startTime: startI.value, endTime: endI.value,
            venue: venueI.value.trim(), capacity: cap, ruleId: null,
            kind: kind, capacityMen: capMen, capacityWomen: capWomen,
            visibility: isGendered ? visSel.value : 'public',
            videoUrl: videoUrl || null
          });
          UI().toast('練習を作成しました。');
        }
        form.remove();
        renderAdminPractices();
      } catch (ex) {
        var msg = ex && ex.message ? ex.message : '';
        // 重複は DB の制約名をそのまま出さず日本語で伝える (E2-3(3))。
        if (/duplicate key|unique constraint/i.test(msg)) {
          msg = '同じ日時・会場の練習がすでにあります。';
        }
        err.textContent = '保存できませんでした。' + (msg ? ' ' + msg : '');
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
    // 表示範囲で絞る (日付は JST の今日と比較。今日の練習は「今後の練習」)。
    var today = UI().jstTodayStr();
    var upcoming = list.filter(function (p) { return String(p.practice_date || '') >= today; });
    var past = list.filter(function (p) { return String(p.practice_date || '') < today; });
    if (filterBtns.upcoming) { filterBtns.upcoming.textContent = '今後の練習 (' + upcoming.length + ')'; }
    if (filterBtns.past) { filterBtns.past.textContent = '開催済み (' + past.length + ')'; }
    if (filterBtns.all) { filterBtns.all.textContent = 'すべて (' + list.length + ')'; }
    var shown = listFilter === 'past' ? past : listFilter === 'all' ? list : upcoming;
    wrap.innerHTML = '';
    if (shown.length === 0) {
      UI().showEmpty(wrap, listFilter === 'past' ? '開催済みの練習がありません。' : listFilter === 'all' ? '練習がありません。' : '今後の練習がありません。');
      return;
    }
    var container = document.createElement('div');
    container.className = 'practice-list';
    shown.forEach(function (p) {
      container.appendChild(practiceCard(p, wrap));
    });
    wrap.appendChild(container);
  }

  // ---- 管理カレンダー (一覧と切り替え。会員カレンダーと同じ見た目) ----
  function adminTodayParts() {
    var t = UI().jstTodayStr().split('-');
    return { year: parseInt(t[0], 10), month: parseInt(t[1], 10) };
  }

  function shiftAdminMonth(dm) {
    var m = calMonth + dm;
    var y = calYear;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    calYear = y;
    calMonth = m;
    calSelected = '';
  }

  async function renderAdminCalendar(wrap) {
    wrap.innerHTML = '<p>読み込み中…</p>';
    var practices;
    try {
      practices = await Api().adminListPractices();
    } catch (e) {
      UI().showError(wrap, '練習一覧を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), function () { renderAdminCalendar(wrap); });
      return;
    }
    adminCache = Array.isArray(practices) ? practices : [];
    drawAdminCalendar(wrap);
  }

  function drawAdminCalendar(wrap) {
    wrap.innerHTML = '';
    var t = adminTodayParts();
    if (!calYear) {
      calYear = t.year;
      calMonth = t.month;
      calSelected = UI().jstTodayStr();
    }

    var nav = document.createElement('div');
    nav.className = 'calendar-nav';
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-ghost btn-small';
    prevBtn.textContent = '‹ 前月';
    prevBtn.addEventListener('click', function () { shiftAdminMonth(-1); drawAdminCalendar(wrap); });
    var monthLabel = document.createElement('span');
    monthLabel.className = 'cal-month';
    monthLabel.textContent = UI().fmtMonthJST(calYear, calMonth);
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-ghost btn-small';
    nextBtn.textContent = '次月 ›';
    nextBtn.addEventListener('click', function () { shiftAdminMonth(1); drawAdminCalendar(wrap); });
    var todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'btn btn-ghost btn-small';
    todayBtn.textContent = '今月';
    todayBtn.addEventListener('click', function () {
      var tt = adminTodayParts();
      calYear = tt.year;
      calMonth = tt.month;
      calSelected = UI().jstTodayStr();
      drawAdminCalendar(wrap);
    });
    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);
    nav.appendChild(todayBtn);
    wrap.appendChild(nav);

    var legend = document.createElement('p');
    legend.className = 'muted cal-legend';
    legend.innerHTML = '<span class="cal-dot cal-dot-practice"></span> 練習　'
      + '<span class="cal-dot cal-dot-match"></span> 練習試合　'
      + '<span class="cal-dot cal-dot-tournament"></span> 大会';
    wrap.appendChild(legend);

    var days = {};
    adminCache.forEach(function (p) {
      var key = String(p.practice_date || p.date || '').slice(0, 10);
      if (!key) { return; }
      if (!days[key]) { days[key] = []; }
      days[key].push(p);
    });

    wrap.appendChild(UI().renderCalendarGrid({
      year: calYear,
      month: calMonth,
      days: days,
      selectedDate: calSelected,
      onSelect: function (dateStr) {
        calSelected = dateStr;
        drawAdminCalendar(wrap);
      }
    }));

    var daySec = document.createElement('div');
    daySec.className = 'cal-day-list';
    if (!calSelected) {
      var hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = '日をタップすると、その日の練習が出ます。';
      daySec.appendChild(hint);
    } else {
      var h = document.createElement('h2');
      h.className = 'section-title';
      h.textContent = UI().fmtDateJST(calSelected) + ' の予定';
      daySec.appendChild(h);
      var list = days[calSelected] || [];
      if (list.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'この日は練習・試合・大会がありません。';
        daySec.appendChild(empty);
      } else {
        var container = document.createElement('div');
        container.className = 'practice-list';
        list.forEach(function (p) {
          container.appendChild(practiceCard(p, wrap));
        });
        daySec.appendChild(container);
      }
    }
    wrap.appendChild(daySec);
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
    var kindBadge = document.createElement('span');
    kindBadge.className = 'badge kind-badge ' + UI().kindClass(p.kind || 'practice');
    kindBadge.textContent = UI().kindLabel(p.kind || 'practice');
    head.appendChild(kindBadge);
    // 非公開の試合・大会 (SQL 19)。
    if (UI().isPrivate(p)) {
      var pb = document.createElement('span');
      pb.className = 'badge badge-private';
      pb.textContent = '非公開';
      head.appendChild(pb);
    }
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
    if (UI().isMatchOrTournament(p)) {
      counts.textContent = UI().genderCountsText(p);
    } else {
      counts.textContent = '定員: ' + (p.capacity !== undefined ? p.capacity : 18) + '人'
        + (p.confirmed_count !== undefined ? '　確定 ' + p.confirmed_count + '人' : '')
        + (((p.waitlist_count !== undefined ? p.waitlist_count : p.waitlisted_count) || 0) > 0
          ? '　待ち ' + (p.waitlist_count !== undefined ? p.waitlist_count : p.waitlisted_count) + '人' : '');
    }
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
    // v18: 参加者への一斉連絡 (確定者＋待ちの人にプッシュ通知＋アプリ内表示)。
    addBtn('参加者へ連絡', 'btn-ghost', function () { showAnnouncementForm(p, detail, wrap); });
    // v18: チーム分け (確定者が 2 人以上のときに表示)。
    var confirmedCount = p.confirmed_count !== undefined ? p.confirmed_count : null;
    if (confirmedCount === null || confirmedCount >= 2) {
      addBtn('チーム分け', 'btn-ghost', function () { showTeamSplit(p, detail, wrap); });
    }
    // 動画リンク (SQL 21): リンクがある練習には「動画を見る」を出す (別タブ)。
    if (p.video_url) {
      var vl = document.createElement('a');
      vl.className = 'btn btn-ghost btn-small';
      vl.href = p.video_url;
      vl.target = '_blank';
      vl.rel = 'noopener';
      vl.textContent = '動画を見る';
      actions.appendChild(vl);
    }
    addBtn('編集', 'btn-ghost', function () { showPracticeForm(viewEl(), p); });
    // 招待管理は非公開の試合・大会のときだけ出す (SQL 19)。
    if (UI().isMatchOrTournament(p) && UI().isPrivate(p)) {
      addBtn('招待管理', 'btn-ghost', function () { showInvitations(p, detail, wrap); });
    }
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
    // 出欠確定済みの練習では確定ボタンを出さない (二重確定の経路を消す。E2-5)。
    if (!p.attendance_finalized_at) {
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
    }
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
      // v18: 開催済みの練習では、確定者ごとに出席／未入力／欠席を付けられる。
      // 当日・未来の練習には出欠欄を出さない。
      var isPast = String(p.practice_date || '').slice(0, 10) < UI().jstTodayStr();
      var html = '<table class="data"><thead><tr><th>LINE名</th><th>No.</th><th>状態</th>' + (isPast ? '<th>出欠</th>' : '') + '<th></th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var st = r.status || '';
        var label = st === 'confirmed' ? '確定' : st === 'waitlisted' ? ('待ち' + (r.waitlist_position ? r.waitlist_position + '番目' : '')) : st === 'walkin' ? 'ウォークイン' : (st || '—');
        html += '<tr><td>' + UI().esc(r.line_name || '-') + '</td><td>' + UI().esc(r.member_no !== undefined ? r.member_no : '-') + '</td><td>' + UI().esc(label) + '</td>';
        if (isPast) {
          if (st === 'confirmed' && r.member_no !== undefined) {
            var cur = r.attendance_status || '';
            html += '<td><select data-att-member="' + UI().esc(r.member_no) + '" data-att-prev="' + UI().esc(cur) + '">'
              + '<option value=""' + (cur === '' ? ' selected' : '') + '>未入力</option>'
              + '<option value="attended"' + (cur === 'attended' ? ' selected' : '') + '>出席</option>'
              + '<option value="absent"' + (cur === 'absent' ? ' selected' : '') + '>欠席</option></select></td>';
          } else {
            html += '<td>—</td>';
          }
        }
        html += '<td>' + (r.registration_id ? '<button type="button" class="btn btn-cancel btn-small" data-reg="' + UI().esc(r.registration_id) + '">代理キャンセル</button>' : '') + '</td></tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
      detail.appendChild(table);
      table.querySelectorAll('[data-att-member]').forEach(function (sel) {
        sel.addEventListener('change', async function () {
          var memberNo = parseInt(sel.getAttribute('data-att-member'), 10);
          var prev = sel.getAttribute('data-att-prev') || '';
          var value = sel.value;
          try {
            await Api().adminSetAttendance(pid(p), memberNo, value || null);
            sel.setAttribute('data-att-prev', value);
            UI().toast(value === 'attended' ? '出席にしました。' : value === 'absent' ? '欠席にしました。' : '未入力に戻しました。');
          } catch (e) {
            UI().toast('出欠を記録できませんでした。' + UI().friendlyError(e));
            sel.value = prev;
          }
        });
      });
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
            // カレンダー表示中でも一覧表示中でも、表示モードを維持したまま
            // 全体を描画し直す (refreshList だとカレンダーが一覧に戻るため)。
            renderAdminPractices();
          } catch (e) { UI().toast('代理キャンセルに失敗しました。' + (e && e.message ? ' ' + e.message : '')); }
        });
      });
    } catch (e) {
      detail.innerHTML = '<p class="danger-text">名簿を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
    }
  }

  // v18: 参加者への一斉連絡 (SQL 22)。
  // メッセージ入力 (最大 500 字、カウンタ付き) → 確定者＋待ちの人へ送信。
  // 送信履歴の一覧と削除もここで行う。
  function showAnnouncementForm(p, detail, wrap) {
    detail.innerHTML = '';
    var title = document.createElement('h3');
    title.textContent = '参加者へ連絡';
    detail.appendChild(title);
    var note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'この練習の確定者と待ちの人全員に、プッシュ通知とアプリ内のお知らせで届きます。';
    detail.appendChild(note);

    var form = document.createElement('form');
    form.className = 'form';
    var area = document.createElement('textarea');
    area.rows = 4;
    area.maxLength = 500;
    area.placeholder = '例: 明日は会場が梅島小学校に変わります。';
    fieldRow(form, 'メッセージ（500字まで）', area);
    var counter = document.createElement('p');
    counter.className = 'muted';
    counter.textContent = '0/500字';
    form.appendChild(counter);
    var err = document.createElement('p');
    err.className = 'field-error';
    err.hidden = true;
    form.appendChild(err);
    function validate(text) {
      var Pure = window.V19Pure;
      if (Pure && Pure.validateAnnouncementMessage) { return Pure.validateAnnouncementMessage(text); }
      var t = (text === null || text === undefined) ? '' : String(text).trim();
      if (t.length === 0) { return { ok: false, error: 'empty_message' }; }
      if (t.length > 500) { return { ok: false, error: 'message_too_long' }; }
      return { ok: true, length: t.length };
    }
    area.addEventListener('input', function () {
      var v = validate(area.value);
      counter.textContent = (v.ok ? v.length : area.value.trim().length) + '/500字';
      err.hidden = true;
    });
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy';
    submit.textContent = '送信する';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      var v = validate(area.value);
      if (!v.ok) {
        err.textContent = UI().friendlyError({ code: v.error, message: v.error });
        err.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        await Api().adminSendAnnouncement(pid(p), area.value.trim());
        UI().toast('お知らせを送りました。');
        area.value = '';
        counter.textContent = '0/500字';
        refreshHistory();
      } catch (ex) {
        err.textContent = '送信できませんでした。' + UI().friendlyError(ex);
        err.hidden = false;
      }
      submit.disabled = false;
    });
    detail.appendChild(form);

    var histTitle = document.createElement('h3');
    histTitle.textContent = '送信履歴';
    detail.appendChild(histTitle);
    var histEl = document.createElement('div');
    detail.appendChild(histEl);
    async function refreshHistory() {
      histEl.innerHTML = '<p>読み込み中…</p>';
      var rows;
      try {
        rows = await Api().adminListAnnouncements(pid(p));
      } catch (e) {
        histEl.innerHTML = '<p class="danger-text">送信履歴を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
        return;
      }
      rows = Array.isArray(rows) ? rows : [];
      histEl.innerHTML = '';
      if (rows.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = '送信したお知らせはまだありません。';
        histEl.appendChild(empty);
        return;
      }
      rows.forEach(function (a) {
        var item = document.createElement('div');
        item.className = 'my-reg-item';
        var msg = document.createElement('p');
        msg.style.margin = '0 0 8px';
        msg.textContent = a.message || '';
        item.appendChild(msg);
        var meta = document.createElement('p');
        meta.className = 'muted';
        meta.style.margin = '0 0 8px';
        meta.textContent = (a.created_at ? UI().fmtDateTimeJST(a.created_at) : '')
          + (a.created_by_line_name ? '　送信者: ' + a.created_by_line_name : '');
        item.appendChild(meta);
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-cancel btn-small';
        delBtn.textContent = '削除';
        delBtn.addEventListener('click', async function () {
          var ok = await UI().confirmSheet({
            title: 'お知らせを削除しますか？',
            body: 'このお知らせは会員の画面からも消えます。プッシュ通知で届いた分は取り消せません。',
            okLabel: '削除する', danger: true
          });
          if (!ok) { return; }
          try {
            await Api().adminDeleteAnnouncement(a.announcement_id);
            UI().toast('お知らせを削除しました。');
            refreshHistory();
          } catch (ex) { UI().toast('削除できませんでした。' + UI().friendlyError(ex)); }
        });
        item.appendChild(delBtn);
        histEl.appendChild(item);
      });
    }
    refreshHistory();
  }

  // v18: チーム分けツール (SQL 22)。
  // 確定者をレベル・セッターで自動分けし、タップで 2 人交換して保存する。
  // レベルは管理者画面にのみ表示する。
  function showTeamSplit(p, detail, wrap) {
    detail.innerHTML = '<p>読み込み中…</p>';
    // 確定者とレベル・ポジションを集める。admin_get_practice_roster には
    // レベルが含まれないため、admin_list_members から補う。
    Promise.all([
      Api().adminGetPracticeRoster(pid(p)),
      Api().adminListMembers('').catch(function () { return []; }),
      Api().adminListTeams(pid(p)).catch(function () { return []; })
    ]).then(function (results) {
      var roster = Array.isArray(results[0]) ? results[0] : [];
      var members = Array.isArray(results[1]) ? results[1] : [];
      var saved = Array.isArray(results[2]) ? results[2] : [];
      var byNo = {};
      members.forEach(function (m) { byNo[m.member_no] = m; });
      var confirmed = roster.filter(function (r) { return r.status === 'confirmed'; });
      if (confirmed.length < 2) {
        detail.innerHTML = '<p>確定者が2人未満のため、チーム分けできません。</p>';
        return;
      }
      var splitMembers = confirmed.map(function (r) {
        var m = byNo[r.member_no] || {};
        return {
          memberNo: r.member_no,
          lineName: r.line_name || m.line_name || '',
          gender: m.gender || '',
          skillLevel: (m.skill_level !== undefined ? m.skill_level : null),
          position: m.volleyball_position || null
        };
      });
      drawTeamSplit(detail, p, splitMembers, saved);
    }).catch(function (e) {
      detail.innerHTML = '<p class="danger-text">名簿を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
    });
  }

  function drawTeamSplit(detail, p, splitMembers, saved) {
    detail.innerHTML = '';
    var title = document.createElement('h3');
    title.textContent = 'チーム分け（確定 ' + splitMembers.length + '人）';
    detail.appendChild(title);

    var stale = saved.some(function (r) { return !!r.stale; });
    if (stale) {
      var warn = document.createElement('p');
      warn.className = 'danger-text';
      warn.textContent = '申込が変わっています。再分けしてください。';
      detail.appendChild(warn);
    }
    // 保存済みのチーム分けがあれば、最初にそれを表示する。
    var current = null;
    if (saved.length > 0) {
      current = savedTeamsToSplit(saved, splitMembers);
      var savedNote = document.createElement('p');
      savedNote.className = 'muted';
      var savedAt = saved[0] && saved[0].saved_at ? UI().fmtDateTimeJST(saved[0].saved_at) : '';
      savedNote.textContent = '保存済みのチーム分けがあります。' + (savedAt ? '（保存: ' + savedAt + '）' : '') + '「自動で分ける」で分け直せます。';
      detail.appendChild(savedNote);
    }

    var form = document.createElement('form');
    form.className = 'form';
    var teamSel = document.createElement('select');
    [['2', '2チーム'], ['3', '3チーム']].forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      teamSel.appendChild(o);
    });
    teamSel.value = splitMembers.length <= 12 ? '2' : '3';
    fieldRow(form, 'チーム数', teamSel);
    var sizesI = fieldRow(form, 'チームごとの人数（例: 7,7）', inputOf('text', '', false));
    sizesI.placeholder = '例: 7,7 / 5,5,6（空欄なら均等に分けます）';
    sizesI.maxLength = 20;
    var sizeNote = document.createElement('p');
    sizeNote.className = 'muted';
    sizeNote.textContent = '人数を指定しない場合は、人数差が最大 1 になるよう均等に分けます。';
    form.appendChild(sizeNote);
    var err = document.createElement('p');
    err.className = 'field-error';
    err.hidden = true;
    form.appendChild(err);
    var autoBtn = document.createElement('button');
    autoBtn.type = 'submit';
    autoBtn.className = 'btn btn-navy';
    autoBtn.textContent = '自動で分ける';
    form.appendChild(autoBtn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var teamCount = parseInt(teamSel.value, 10);
      var sizesText = (sizesI.value || '').trim();
      var sizes = null;
      if (sizesText !== '') {
        var parts = sizesText.split(',');
        if (parts.length !== teamCount || parts.some(function (s) { return !/^\d+$/.test(s.trim()); })) {
          err.textContent = '人数は「7,7」のように、カンマ区切りでチーム数分入力してください。';
          err.hidden = false;
          return;
        }
        sizes = parts.map(function (s) { return parseInt(s.trim(), 10); });
      }
      var Pure = window.V19Pure;
      if (!Pure || !Pure.splitTeams) {
        err.textContent = 'チーム分けの読み込みに失敗しました。ページを読み込み直してください。';
        err.hidden = false;
        return;
      }
      try {
        current = Pure.splitTeams(splitMembers, teamCount, sizes);
        selected = null;
        renderTeams();
      } catch (ex) {
        // 人数の合計不一致など。メッセージはそのまま出す。
        err.textContent = ex && ex.message ? ex.message : '自動分けに失敗しました。';
        err.hidden = false;
      }
    });
    detail.appendChild(form);

    var teamsEl = document.createElement('div');
    detail.appendChild(teamsEl);

    var selected = null; // {memberNo, teamNo}: タップで選択中のメンバー
    function teamScore(members) {
      var score = { S: 5, A: 4, B: 3, C: 2, D: 1 };
      return members.reduce(function (sum, m) {
        return sum + (m.skillLevel && score[m.skillLevel] ? score[m.skillLevel] : 2);
      }, 0);
    }
    function renderTeams() {
      teamsEl.innerHTML = '';
      if (!current) {
        var hint = document.createElement('p');
        hint.className = 'muted';
        hint.textContent = '「自動で分ける」を押すと、レベルとセッターを考えて分けます。';
        teamsEl.appendChild(hint);
        saveBtn.disabled = true;
        return;
      }
      saveBtn.disabled = false;
      current.forEach(function (t) {
        var box = document.createElement('div');
        box.className = 'my-reg-item';
        var h = document.createElement('h3');
        h.textContent = UI().teamLabel(t.teamNo) + '（' + t.members.length + '人・合計 ' + teamScore(t.members) + '）';
        box.appendChild(h);
        var ul = document.createElement('ul');
        ul.className = 'roster-list';
        t.members.forEach(function (m) {
          var li = document.createElement('li');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-small ' + (selected && selected.memberNo === m.memberNo ? 'btn-navy' : 'btn-ghost');
          btn.textContent = (m.lineName || '-') + '（' + (m.skillLevel || '未設定') + '・' + UI().positionLabel(m.position || '') + '）';
          btn.addEventListener('click', function () {
            if (!selected) { selected = { memberNo: m.memberNo, teamNo: t.teamNo }; renderTeams(); return; }
            if (selected.memberNo === m.memberNo) { selected = null; renderTeams(); return; }
            if (selected.teamNo === t.teamNo) { selected = { memberNo: m.memberNo, teamNo: t.teamNo }; renderTeams(); return; }
            // 別チームの 2 人を交換する。
            var from = null, to = null;
            current.forEach(function (team) {
              team.members.forEach(function (mm, idx) {
                if (mm.memberNo === selected.memberNo) { from = { team: team, idx: idx, member: mm }; }
                if (mm.memberNo === m.memberNo) { to = { team: team, idx: idx, member: mm }; }
              });
            });
            if (from && to) {
              from.team.members[from.idx] = to.member;
              to.team.members[to.idx] = from.member;
            }
            selected = null;
            renderTeams();
          });
          li.appendChild(btn);
          ul.appendChild(li);
        });
        box.appendChild(ul);
        teamsEl.appendChild(box);
      });
      var tapNote = document.createElement('p');
      tapNote.className = 'muted';
      tapNote.textContent = '2 人をタップするとチームを交換できます。保存するまで何度でも変えられます。';
      teamsEl.appendChild(tapNote);
    }

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-navy btn-large';
    saveBtn.textContent = 'チーム分けを保存する';
    saveBtn.disabled = true;
    saveBtn.addEventListener('click', async function () {
      if (!current) { return; }
      var teams = [];
      current.forEach(function (t) {
        t.members.forEach(function (m) {
          teams.push({ member_no: m.memberNo, team_no: t.teamNo });
        });
      });
      saveBtn.disabled = true;
      try {
        await Api().adminSaveTeams(pid(p), teams);
        UI().toast('チーム分けを保存しました。');
      } catch (ex) {
        UI().toast('保存できませんでした。' + UI().friendlyError(ex));
        saveBtn.disabled = false;
      }
    });
    detail.appendChild(saveBtn);
    renderTeams();
  }

  // admin_list_teams の行を splitTeams と同じ形に組み立てる。
  // 保存済みにない確定者 (保存後に増えた人) はここには載せず、
  // stale 警告で再分けを促す。
  function savedTeamsToSplit(saved, splitMembers) {
    var byNo = {};
    splitMembers.forEach(function (m) { byNo[m.memberNo] = m; });
    var teams = [];
    var byTeam = {};
    saved.forEach(function (r) {
      var m = byNo[r.member_no];
      if (!m) { return; }
      if (!byTeam[r.team_no]) {
        byTeam[r.team_no] = { teamNo: r.team_no, members: [] };
        teams.push(byTeam[r.team_no]);
      }
      byTeam[r.team_no].members.push(m);
    });
    teams.sort(function (a, b) { return a.teamNo - b.teamNo; });
    return teams;
  }

  // 招待管理 (SQL 19): 非公開の試合・大会にだけ表示する。
  // メンバー選択 + 「招待を送る」ボタン、招待一覧 (LINE名・状態・招待日時・
  // 取り消しボタン)。辞退・保留・取り消し済みの招待は再送できる
  // (再送すると再度「承認待ち」になる)。
  async function showInvitations(p, detail, wrap) {
    detail.innerHTML = '<p>読み込み中…</p>';
    try {
      var rows = await Api().adminListInvitations(pid(p));
      var list = Array.isArray(rows) ? rows : [];
      detail.innerHTML = '';

      var form = document.createElement('form');
      form.className = 'form';
      // 絞り込み (SQL 27): キーワード (LINE名・本名・特徴メモ) と
      // ユニフォーム購入済みのみ。大会・練習試合の招待先選び用。
      var filterQ = document.createElement('input');
      filterQ.type = 'search';
      filterQ.placeholder = 'LINE名・本名・特徴メモで絞り込み';
      var filterQWrap = document.createElement('div');
      filterQWrap.className = 'field';
      var filterQLabel = document.createElement('label');
      filterQLabel.textContent = '絞り込み';
      filterQWrap.appendChild(filterQLabel);
      filterQWrap.appendChild(filterQ);
      form.appendChild(filterQWrap);
      var uniOnlyLab = document.createElement('label');
      uniOnlyLab.className = 'checkbox-item';
      var uniOnlyCb = document.createElement('input');
      uniOnlyCb.type = 'checkbox';
      uniOnlyLab.appendChild(uniOnlyCb);
      uniOnlyLab.appendChild(document.createTextNode('ユニフォーム購入済みのみ'));
      form.appendChild(uniOnlyLab);
      var filterCount = document.createElement('p');
      filterCount.className = 'muted';
      form.appendChild(filterCount);
      var sel = document.createElement('select');
      sel.required = true;
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'メンバーを選択';
      sel.appendChild(ph);
      form.appendChild(sel);
      var allMembers = [];
      function applyInviteFilter() {
        if (window.V19Pure && window.V19Pure.filterInviteCandidates) {
          var filtered = window.V19Pure.filterInviteCandidates(allMembers, {
            query: filterQ.value, uniformOnly: uniOnlyCb.checked
          });
          filterCount.textContent = '対象 ' + filtered.length + '名';
          fillMemberSelect(sel, filtered);
        } else {
          fillMemberSelect(sel, allMembers);
        }
      }
      Api().adminListMembers('').then(function (rows) {
        allMembers = Array.isArray(rows) ? rows : [];
        applyInviteFilter();
      }).catch(function () { fillMemberSelect(sel); });
      filterQ.addEventListener('input', applyInviteFilter);
      uniOnlyCb.addEventListener('change', applyInviteFilter);
      var send = document.createElement('button');
      send.type = 'submit';
      send.className = 'btn btn-navy';
      send.textContent = '招待を送る';
      form.appendChild(send);
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '招待されたメンバーは、マイページで「参加する」を選ぶとこのイベントが見えるようになります。「保留」も選べます。';
      form.appendChild(note);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var memberNo = parseInt(sel.value, 10);
        if (!memberNo) {
          UI().toast('メンバーを選択してください。');
          return;
        }
        send.disabled = true;
        try {
          await Api().adminInviteMember(pid(p), memberNo);
          UI().toast('招待を送りました。');
          showInvitations(p, detail, wrap);
        } catch (ex) {
          UI().toast('招待を送れませんでした。' + UI().friendlyError(ex));
          send.disabled = false;
        }
      });
      detail.appendChild(form);

      if (list.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = '招待はまだありません。';
        detail.appendChild(empty);
        return;
      }
      var table = document.createElement('div');
      table.className = 'table-wrap';
      var html = '<table class="data"><thead><tr><th>LINE名</th><th>状態</th><th>招待日時</th><th></th></tr></thead><tbody>';
      list.forEach(function (inv) {
        // 回答日時は、参加・辞退・保留の行にだけ表示する
        // (取り消し済みの行の responded_at は取り消し前の回答時刻のため)。
        var showResponded = (inv.status === 'accepted' || inv.status === 'declined' || inv.status === 'held') && inv.responded_at;
        var responded = showResponded ? '（' + UI().fmtDateTimeJST(inv.responded_at) + '）' : '';
        html += '<tr><td>' + UI().esc(inv.line_name || '-') + '</td><td>' + UI().esc(UI().invitationStatusLabel(inv.status)) + responded + '</td>';
        html += '<td>' + UI().esc(inv.invited_at ? UI().fmtDateTimeJST(inv.invited_at) : '-') + '</td>';
        var canCancel = inv.status === 'pending' || inv.status === 'held' || inv.status === 'accepted';
        html += '<td>' + (canCancel ? '<button type="button" class="btn btn-cancel btn-small" data-inv="' + UI().esc(String(inv.member_no)) + '">取り消し</button>' : '') + '</td></tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
      detail.appendChild(table);
      table.querySelectorAll('[data-inv]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await UI().confirmSheet({
            title: '招待を取り消しますか？',
            body: 'この招待を取り消します。申込済みの場合は申込は残ります。',
            okLabel: '取り消す', danger: true
          });
          if (!ok) { return; }
          try {
            await Api().adminCancelInvitation(pid(p), parseInt(btn.getAttribute('data-inv'), 10));
            UI().toast('招待を取り消しました。');
            showInvitations(p, detail, wrap);
          } catch (ex) { UI().toast('取り消しに失敗しました。' + UI().friendlyError(ex)); }
        });
      });
    } catch (e) {
      detail.innerHTML = '<p class="danger-text">招待一覧を取得できませんでした。' + UI().esc(e && e.message ? e.message : '') + '</p>';
    }
  }

  function changeCapacity(p, detail, wrap) {
    detail.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'form';
    // ブラウザ標準の min チェックだと定員0が無言で止まるため、
    // JS 側のチェックを必ず通す (E2-4)。
    form.noValidate = true;

    // 試合・大会は男女別定員を変更する (SQL 17)。
    if (UI().isMatchOrTournament(p)) {
      var curMen = p.capacity_men !== undefined && p.capacity_men !== null ? p.capacity_men : 6;
      var curWomen = p.capacity_women !== undefined && p.capacity_women !== null ? p.capacity_women : 6;
      var menI = fieldRow(form, '男性マックス（現在 ' + curMen + '人）', inputOf('number', curMen, true));
      menI.min = '1';
      menI.max = '100';
      var womenI = fieldRow(form, '女性マックス（現在 ' + curWomen + '人）', inputOf('number', curWomen, true));
      womenI.min = '1';
      womenI.max = '100';
      var noteG = document.createElement('p');
      noteG.className = 'muted';
      noteG.textContent = '定員を減らすと、その性別の確定が遅い順に待ちに戻ります。';
      form.appendChild(noteG);
      var submitG = document.createElement('button');
      submitG.type = 'submit';
      submitG.className = 'btn btn-navy';
      submitG.textContent = '定員を変更';
      form.appendChild(submitG);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var nextMen = parseInt(menI.value, 10);
        var nextWomen = parseInt(womenI.value, 10);
        if (!nextMen || nextMen < 1 || nextMen > 100 || !nextWomen || nextWomen < 1 || nextWomen > 100) {
          UI().toast('男性マックス・女性マックスは1〜100人で入力してください。');
          return;
        }
        if (nextMen < curMen || nextWomen < curWomen) {
          var ok = await UI().confirmSheet({
            title: '定員を減らしますか？',
            body: '男性マックスを ' + curMen + '人から ' + nextMen + '人、女性マックスを ' + curWomen + '人から ' + nextWomen + '人に変更します。減らした枠は、確定が遅い順にメンバーが待ちに戻ります。',
            okLabel: '減らす', danger: true
          });
          if (!ok) { return; }
        }
        try {
          await Api().adminChangeCapacity(pid(p), null, nextMen, nextWomen);
          UI().toast('定員を変更しました。');
          renderAdminPractices();
        } catch (ex) { UI().toast('定員変更に失敗しました。' + (ex && ex.message ? ' ' + ex.message : '')); }
      });
      detail.appendChild(form);
      menI.focus();
      return;
    }

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
      if (!next || next < 1 || next > 100) {
        UI().toast('定員は1〜100人で入力してください。');
        return;
      }
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
      // fillMemberSelect は非同期。読み込み前/空のまま送信されると
      // native required が無言で止めるため、JS で明示する。
      if (!sel.value) { UI().toast('メンバーを選択してください。'); return; }
      try {
        await Api().adminProxyApply(pid(p), parseInt(sel.value, 10), reason.value.trim());
        UI().toast('代理申込しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('代理申込に失敗しました。' + UI().friendlyError(ex)); }
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
      if (!sel.value) { UI().toast('メンバーを選択してください。'); return; }
      try {
        await Api().adminAddWalkin(pid(p), parseInt(sel.value, 10));
        UI().toast('ウォークインを追加しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('追加に失敗しました。' + UI().friendlyError(ex)); }
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
      if (!sel.value) { UI().toast('メンバーを選択してください。'); return; }
      try {
        await Api().adminCorrectAttendance(pid(p), parseInt(sel.value, 10), resSel.value, reason.value.trim());
        UI().toast('出欠を訂正しました。');
        renderAdminPractices();
      } catch (ex) { UI().toast('訂正に失敗しました。' + UI().friendlyError(ex)); }
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
      // 基準日が選択した曜日と一致しないと、ルールが意図した曜日で
      // 生成されない。サーバーは基準日から曜日をずらさないため
      // 送信前にチェックする (日付のみの曜日は UTC 午夜で求める)。
      var anchorParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor.value || '');
      if (anchorParts) {
        var anchorWd = new Date(Date.UTC(parseInt(anchorParts[1], 10), parseInt(anchorParts[2], 10) - 1, parseInt(anchorParts[3], 10))).getUTCDay();
        if (anchorWd !== parseInt(wdSel.value, 10)) {
          UI().toast('基準日は選択した曜日と一致する日を選んでください。');
          return;
        }
      }
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
      } catch (ex) { UI().toast('ルールの作成に失敗しました。' + UI().friendlyError(ex)); }
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
      } catch (ex) { UI().toast('生成に失敗しました。' + UI().friendlyError(ex)); }
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
