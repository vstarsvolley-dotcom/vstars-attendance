/* Vstars 出欠 — UI 共通部品
 * 日付表示はすべて Asia/Tokyo (JST)。状態は必ずテキストで表示する (色だけにしない)。
 */
'use strict';

(function () {
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  var toastTimer = null;

  function Api() { return window.VstarsApi; }

  function parseDate(value) {
    if (!value) { return null; }
    if (value instanceof Date) { return value; }
    // 'YYYY-MM-DD' は UTC 午夜として組み立てる。ローカルで組むと
    // 端末のタイムゾーンによっては前日になり、曜日・日付がずれる。
    // JST への変換は jstParts (Intl, Asia/Tokyo) が行う。
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (m) { return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))); }
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // JST の曜日・日付を取得する (タイムゾーン指定で変換)
  function jstParts(date) {
    var fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short'
    });
    var parts = {};
    fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts;
  }

  // '12/2（火）19:00〜21:00'
  function fmtDateTimeJST(date, startTime, endTime) {
    var d = parseDate(date);
    if (!d) { return ''; }
    var p = jstParts(d);
    // 曜日は常に JST 変換の結果を使う (ローカルの getDay() は端末の
    // タイムゾーンに依存してずれるため使わない)。
    var weekday = (p.weekday || '').replace('曜日', '') || WEEKDAYS[d.getDay()];
    var start = (startTime || '').slice(0, 5);
    var end = (endTime || '').slice(0, 5);
    var time = start && end ? start + '〜' + end : (start || end || '');
    return p.month + '/' + p.day + '（' + weekday + '）' + (time ? ' ' + time : '');
  }

  // '12/2（火）'
  function fmtDateJST(date) {
    var d = parseDate(date);
    if (!d) { return ''; }
    var p = jstParts(d);
    var weekday = (p.weekday || '').replace('曜日', '') || WEEKDAYS[d.getDay()];
    return p.month + '/' + p.day + '（' + weekday + '）';
  }

  function fmtMonthJST(year, month) {
    return year + '年' + month + '月';
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { return; }
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // 下から出る確認シート。Promise<boolean> を返す。
  function confirmSheet(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var backdrop = document.getElementById('sheet');
      var titleEl = document.getElementById('sheet-title');
      var bodyEl = document.getElementById('sheet-body');
      var actionsEl = document.getElementById('sheet-actions');
      if (!backdrop || !titleEl || !bodyEl || !actionsEl) { resolve(false); return; }

      titleEl.textContent = opts.title || '確認';
      bodyEl.innerHTML = '';
      if (opts.body) {
        var p = document.createElement('p');
        p.textContent = opts.body;
        bodyEl.appendChild(p);
      }
      if (opts.bodyHtml) { bodyEl.innerHTML = opts.bodyHtml; }
      actionsEl.innerHTML = '';

      var done = false;
      function close(result) {
        if (done) { return; }
        done = true;
        backdrop.hidden = true;
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') { close(false); } }

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'btn btn-large ' + (opts.danger ? 'btn-danger' : 'btn-navy');
      okBtn.textContent = opts.okLabel || 'OK';
      okBtn.addEventListener('click', function () { close(true); });

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-large btn-ghost';
      cancelBtn.textContent = opts.cancelLabel || 'やめる';
      cancelBtn.addEventListener('click', function () { close(false); });

      actionsEl.appendChild(okBtn);
      actionsEl.appendChild(cancelBtn);
      backdrop.hidden = false;
      document.addEventListener('keydown', onKey, true);
      backdrop.onclick = function (e) { if (e.target === backdrop) { close(false); } };
      okBtn.focus();
    });
  }

  // 汎用シート (フォーム等を入れる)。閉じる関数を返す。
  function openSheet(title, contentEl, actions) {
    var backdrop = document.getElementById('sheet');
    var titleEl = document.getElementById('sheet-title');
    var bodyEl = document.getElementById('sheet-body');
    var actionsEl = document.getElementById('sheet-actions');
    titleEl.textContent = title || '';
    bodyEl.innerHTML = '';
    if (contentEl) { bodyEl.appendChild(contentEl); }
    actionsEl.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-large ' + (a.className || 'btn-ghost');
      b.textContent = a.label;
      b.addEventListener('click', function () { if (a.onClick) { a.onClick(); } });
      actionsEl.appendChild(b);
    });
    backdrop.hidden = false;
    function close() { backdrop.hidden = true; }
    backdrop.onclick = function (e) { if (e.target === backdrop) { close(); } };
    return close;
  }

  function closeSheet() {
    var backdrop = document.getElementById('sheet');
    if (backdrop) { backdrop.hidden = true; }
  }

  function showLoading(view, msg) {
    if (!view) { return; }
    view.innerHTML = '<div class="state-block"><p class="loading-text">' + esc(msg || '読み込み中…') + '</p></div>';
  }

  function showError(view, msg, retryFn) {
    if (!view) { return; }
    view.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'state-block error-block';
    var p = document.createElement('p');
    p.textContent = msg || '読み込みに失敗しました。';
    div.appendChild(p);
    if (retryFn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-navy';
      b.textContent = 'もう一度試す';
      b.addEventListener('click', retryFn);
      div.appendChild(b);
    }
    view.appendChild(div);
  }

  function showEmpty(view, msg) {
    if (!view) { return; }
    view.innerHTML = '<div class="state-block"><p>' + esc(msg || '表示するものがありません。') + '</p></div>';
  }

  function genderLabel(g) {
    switch (g) {
      case 'male': return '男性';
      case 'female': return '女性';
      case 'other': return 'その他';
      case 'prefer_not_to_say': return '回答しない';
      default: return g ? String(g) : '—';
    }
  }

  // 練習の種別 (SQL 17: practices.kind)。
  // practice=練習 / match=練習試合 / tournament=大会。
  function kindLabel(kind) {
    switch (kind) {
      case 'match': return '練習試合';
      case 'tournament': return '大会';
      case 'practice':
      default: return '練習';
    }
  }

  function kindClass(kind) {
    switch (kind) {
      case 'match': return 'kind-match';
      case 'tournament': return 'kind-tournament';
      case 'practice':
      default: return 'kind-practice';
    }
  }

  function isMatchOrTournament(practice) {
    var k = practice && (practice.kind || practice.practice_kind);
    return k === 'match' || k === 'tournament';
  }

  // 公開/非公開 (SQL 19: practices.visibility)。
  // 'public'=公開 / 'private'=非公開。練習は常に公開。
  function visibilityLabel(visibility) {
    return visibility === 'private' ? '非公開' : '公開';
  }

  function isPrivate(practice) {
    return !!practice && practice.visibility === 'private';
  }

  // 招待の状態表示 (SQL 19: practice_invitations.status)。
  function invitationStatusLabel(status) {
    switch (status) {
      case 'accepted': return '参加';
      case 'declined': return '辞退';
      case 'held': return '保留';
      case 'cancelled': return '取り消し済み';
      case 'pending':
      default: return '承認待ち';
    }
  }

  // 確定数の表示。試合・大会は男女別 (男 X/Y・女 A/B)。
  // その他 (other / prefer_not_to_say) がいれば「・その他 N名」を付ける。
  // 練習は従来通り「確定 n / 定員名」。
  function genderCountsText(practice) {
    // 人数は v19-pure の practiceCounts で読む (DB の waitlisted_count と
    // 表示側の waitlist_count の名前不一致で待ち人数が 0 になっていた)。
    var counts = (window.V19Pure && window.V19Pure.practiceCounts)
      ? window.V19Pure.practiceCounts(practice) : null;
    var confirmed = counts ? counts.confirmed
      : (practice.confirmed_count !== undefined ? practice.confirmed_count
        : (practice.confirmedCount !== undefined ? practice.confirmedCount : 0));
    var waitlist = counts ? counts.waitlist
      : (practice.waitlist_count !== undefined ? practice.waitlist_count
        : (practice.waitlisted_count !== undefined ? practice.waitlisted_count
          : (practice.waitlistCount !== undefined ? practice.waitlistCount : 0)));
    var waitText = waitlist > 0 ? '　待ち ' + waitlist + '名' : '';
    if (!isMatchOrTournament(practice)) {
      var capacity = practice.capacity !== undefined ? practice.capacity : 18;
      return '確定 ' + confirmed + ' / ' + capacity + '名' + waitText;
    }
    var men = counts ? counts.men
      : (practice.confirmed_men !== undefined ? practice.confirmed_men
        : (practice.confirmedMen !== undefined ? practice.confirmedMen : 0));
    var women = counts ? counts.women
      : (practice.confirmed_women !== undefined ? practice.confirmed_women
        : (practice.confirmedWomen !== undefined ? practice.confirmedWomen : 0));
    var other = counts ? counts.other
      : (practice.confirmed_other !== undefined ? practice.confirmed_other
        : (practice.confirmedOther !== undefined ? practice.confirmedOther : 0));
    var capMen = practice.capacity_men !== undefined ? practice.capacity_men
      : (practice.capacityMen !== undefined ? practice.capacityMen : 0);
    var capWomen = practice.capacity_women !== undefined ? practice.capacity_women
      : (practice.capacityWomen !== undefined ? practice.capacityWomen : 0);
    var text = '男 ' + men + '/' + capMen + '・女 ' + women + '/' + capWomen;
    if (other > 0) { text += '・その他 ' + other + '名'; }
    return text + waitText;
  }

  // JST の今日を 'YYYY-MM-DD' で返す (端末のタイムゾーンに依存しない)。
  function jstTodayStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function dateKey(year, month, day) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return year + '-' + pad(month) + '-' + pad(day);
  }

  // 月カレンダーのグリッドを作る。会員・管理者で共用する。
  // opts: { year, month, days: {'YYYY-MM-DD': [practice, ...]},
  //         selectedDate, onSelect(dateStr), todayStr }
  // 日を押すと onSelect が呼ばれる。練習がある日には種別色のドットを付ける。
  // 練習=紺、練習試合=緑、大会=黄 (黄は紺の輪郭付き)。
  function renderCalendarGrid(opts) {
    opts = opts || {};
    var year = opts.year;
    var month = opts.month;
    var days = opts.days || {};
    var selected = opts.selectedDate || '';
    var today = opts.todayStr || jstTodayStr();

    var wrap = document.createElement('div');
    wrap.className = 'calendar';

    var grid = document.createElement('div');
    grid.className = 'calendar-grid';
    ['日', '月', '火', '水', '木', '金', '土'].forEach(function (w) {
      var h = document.createElement('div');
      h.className = 'cal-weekday';
      h.textContent = w;
      grid.appendChild(h);
    });

    var firstWd = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    // その月の日数: 翌月0日 = 当月の末日 (Date.UTC の月は 0 起点のため
    // month をそのまま渡すと翌月になる点に注意)。
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var i;
    for (i = 0; i < firstWd; i++) {
      var blank = document.createElement('div');
      blank.className = 'cal-day cal-blank';
      grid.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      (function (day) {
        var key = dateKey(year, month, day);
        var list = days[key] || [];
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-day';
        if (key === today) { cell.classList.add('cal-today'); }
        if (key === selected) { cell.classList.add('cal-selected'); }
        if (key < today) { cell.classList.add('cal-past'); }
        var num = document.createElement('span');
        num.className = 'cal-num';
        num.textContent = String(day);
        cell.appendChild(num);
        if (list.length > 0) {
          var dots = document.createElement('span');
          dots.className = 'cal-dots';
          list.slice(0, 3).forEach(function (p) {
            var dot = document.createElement('span');
            var k = p.kind || 'practice';
            dot.className = 'cal-dot cal-dot-' + (k === 'match' ? 'match' : k === 'tournament' ? 'tournament' : 'practice');
            dot.title = kindLabel(k);
            dots.appendChild(dot);
          });
          cell.appendChild(dots);
          if (list.length > 3) {
            var more = document.createElement('span');
            more.className = 'cal-more';
            more.textContent = '他' + (list.length - 3) + '件';
            cell.appendChild(more);
          }
        }
        cell.addEventListener('click', function () {
          if (opts.onSelect) { opts.onSelect(key); }
        });
        grid.appendChild(cell);
      })(d);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function positionLabel(p) {    if (Array.isArray(p)) {
      if (p.length === 0) { return '—'; }
      return p.map(positionLabel).join('・');
    }
    switch (p) {
      case 'setter': return 'セッター';
      case 'outside': return 'レフト';
      case 'middle': return 'センター';
      case 'opposite': return 'ライト';
      case 'libero': return 'リベロ';
      case 'undecided': return '未定';
      default: return p ? String(p) : '—';
    }
  }

  // スキルレベル (管理者のみ表示)。意味を併記する (ユーザー決定 2026-11-22)。
  function skillLevelLabel(level) {
    switch (level) {
      case 'S': return 'S（エース級）';
      case 'A': return 'A（主力）';
      case 'B': return 'B（標準）';
      case 'C': return 'C（初級寄り）';
      case 'D': return 'D（初心者）';
      default: return '未設定';
    }
  }

  // 申込状態を必ずテキストで返す。色だけに依存しない。
  function statusLabel(practice) {
    if (!practice) { return '未申込'; }
    var status = practice.my_status || practice.status || practice.myStatus || '';
    var pos = practice.my_waitlist_position || practice.waitlist_position || practice.waitlistPosition;
    if (status === 'confirmed' || status === '確定') { return '✓ 確定'; }
    if (status === 'waitlisted' || status === '待ち' || status === 'waitlist') {
      return pos ? '待ち' + pos + '番目' : '待ち';
    }
    if (status === 'cancelled' || status === 'キャンセル済み' || status === 'canceled') { return 'キャンセル済み'; }
    if (practice.my_registration_id || practice.registration_id) { return '✓ 確定'; }
    return '未申込';
  }

  function statusClass(practice) {
    var label = statusLabel(practice);
    if (label.indexOf('確定') !== -1) { return 'status-confirmed'; }
    if (label.indexOf('待ち') !== -1) { return 'status-waitlist'; }
    if (label.indexOf('キャンセル') !== -1) { return 'status-cancelled'; }
    return 'status-none';
  }

  function csvDownload(filename, text) {
    var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvEscape(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/[",\n]/.test(s)) { return '"' + s.replace(/"/g, '""') + '"'; }
    return s;
  }

  // チーム名: チーム 1=Aチーム、2=Bチーム、3=Cチーム (SQL 22)。
  function teamLabel(teamNo) {
    var labels = ['Aチーム', 'Bチーム', 'Cチーム'];
    var n = parseInt(teamNo, 10);
    if (n >= 1 && n <= labels.length) { return labels[n - 1]; }
    return (teamNo === null || teamNo === undefined ? '' : String(teamNo)) + 'チーム';
  }

  // v18: 申込済みの練習カード内に「運営からのお知らせ」と「あなたのチーム」を
  // 読み込んで表示する。申込んでいない練習のカードには出さない。
  // お知らせは最大 5 件・新しい順。どちらも無ければ枠自体を消す。
  function loadMemberPracticeExtras(container, practice) {
    var api = Api();
    if (!api || !api.listMyAnnouncements || !api.getMyTeam) { return; }
    var id = practice.practice_id || practice.id;
    if (!id) { return; }
    var annP = api.listMyAnnouncements(id).catch(function () { return null; });
    var teamP = api.getMyTeam(id).catch(function () { return null; });
    Promise.all([annP, teamP]).then(function (results) {
      if (!container.isConnected) { return; }
      var anns = Array.isArray(results[0]) ? results[0].slice(0, 5) : [];
      var teams = Array.isArray(results[1]) ? results[1] : [];
      if (anns.length === 0 && teams.length === 0) { container.remove(); return; }
      container.innerHTML = '';
      if (teams.length > 0) {
        var t = teams[0];
        var label = t.team_label || teamLabel(t.team_no);
        var teamLine = document.createElement('p');
        teamLine.className = 'my-team';
        teamLine.textContent = 'あなたは ' + label + 'です。';
        container.appendChild(teamLine);
        if (t.stale) {
          var warn = document.createElement('p');
          warn.className = 'danger-text';
          warn.textContent = '申込が変わっています。再分けしてください。';
          container.appendChild(warn);
        }
      }
      if (anns.length > 0) {
        var h = document.createElement('h3');
        h.textContent = '運営からのお知らせ';
        container.appendChild(h);
        var ul = document.createElement('ul');
        ul.className = 'announcement-list';
        anns.forEach(function (a) {
          var li = document.createElement('li');
          var msg = document.createElement('p');
          msg.textContent = a.message || '';
          li.appendChild(msg);
          if (a.created_at) {
            var when = document.createElement('p');
            when.className = 'muted';
            when.textContent = fmtDateTimeJST(a.created_at);
            li.appendChild(when);
          }
          ul.appendChild(li);
        });
        container.appendChild(ul);
      }
    });
  }

  // 練習カードの DOM を作る。handlers: {onApply, onCancel, onRoster, onToggleSelect, selected}
  function renderPracticeCard(practice, handlers) {
    handlers = handlers || {};
    var id = practice.practice_id || practice.id;
    var date = practice.practice_date || practice.date;
    var cancelled = practice.is_cancelled || practice.cancelled || practice.status === 'cancelled';
    // 過去の練習 (SQL 21): 日付が今日より前。過去分は申込・キャンセルを出さない。
    var isPast = String(date || '').slice(0, 10) < jstTodayStr();
    var myStatus = statusLabel(practice);
    var myRegId = practice.my_registration_id || practice.registration_id || null;

    var card = document.createElement('article');
    card.className = 'practice-card' + (cancelled ? ' is-cancelled' : '');
    card.dataset.practiceId = id || '';

    var head = document.createElement('div');
    head.className = 'practice-head';
    var dateEl = document.createElement('div');
    dateEl.className = 'practice-date';
    dateEl.textContent = fmtDateTimeJST(date, practice.start_time, practice.end_time);
    head.appendChild(dateEl);
    var kindBadge = document.createElement('span');
    kindBadge.className = 'badge kind-badge ' + kindClass(practice.kind || 'practice');
    kindBadge.textContent = kindLabel(practice.kind || 'practice');
    head.appendChild(kindBadge);
    // 非公開の試合・大会は、見えているメンバー (招待承諾済み・申込済み) に
    // バッジで示す (SQL 19)。見えないメンバーにはカード自体が返らない。
    if (isPrivate(practice)) {
      var privateBadge = document.createElement('span');
      privateBadge.className = 'badge badge-private';
      privateBadge.textContent = '非公開';
      head.appendChild(privateBadge);
    }
    var statusEl = document.createElement('span');
    statusEl.className = 'status-badge ' + statusClass(practice);
    statusEl.textContent = myStatus;
    head.appendChild(statusEl);
    card.appendChild(head);

    var venue = document.createElement('p');
    venue.className = 'practice-venue';
    venue.textContent = practice.venue || '';
    card.appendChild(venue);

    var counts = document.createElement('p');
    counts.className = 'practice-counts';
    counts.textContent = genderCountsText(practice);
    card.appendChild(counts);

    // v18: 申込済みの練習には「運営からのお知らせ」と「あなたのチーム」を
    // カード内に出す。申込んでいない・キャンセル済みの練習には出さない。
    var isApplied = myStatus.indexOf('確定') !== -1 || myStatus.indexOf('待ち') !== -1;
    if (isApplied) {
      var extrasEl = document.createElement('div');
      extrasEl.className = 'member-extras';
      card.appendChild(extrasEl);
      loadMemberPracticeExtras(extrasEl, practice);
    }

    if (cancelled) {
      var cx = document.createElement('p');
      cx.className = 'practice-cancelled-note';
      cx.textContent = 'この練習は中止になりました。' + (practice.cancel_reason ? '（' + practice.cancel_reason + '）' : '');
      card.appendChild(cx);
    }

    var actions = document.createElement('div');
    actions.className = 'practice-actions';

    // 動画リンク (SQL 21): 管理者が貼った YouTube プレイリスト等。別タブで開く。
    // 過去・今後・中止を問わず、リンクがある練習には出す。
    if (practice.video_url) {
      var videoLink = document.createElement('a');
      videoLink.className = 'btn btn-ghost btn-small';
      videoLink.href = practice.video_url;
      videoLink.target = '_blank';
      videoLink.rel = 'noopener';
      videoLink.textContent = '動画を見る';
      actions.appendChild(videoLink);
    }

    // チャット (SQL 29): 練習試合・大会のみ。一覧画面 (onChat あり) でのみ出す。
    if (handlers.onChat && isMatchOrTournament(practice) && !cancelled) {
      var chatBtn = document.createElement('button');
      chatBtn.type = 'button';
      chatBtn.className = 'btn btn-ghost btn-small';
      chatBtn.textContent = 'チャット';
      chatBtn.addEventListener('click', function () { handlers.onChat(practice); });
      actions.appendChild(chatBtn);
    }

    if (!cancelled && !isPast) {
      if (myStatus === '未申込') {
        // まとめ申し込みのチェックボックスは、一覧画面でのみ出す。
        // カレンダーの当日一覧では onToggleSelect を渡さないため出ない。
        if (handlers.onToggleSelect) {
          var sel = document.createElement('label');
          sel.className = 'bulk-select';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'bulk-checkbox';
          cb.setAttribute('aria-label', fmtDateTimeJST(date, practice.start_time, practice.end_time) + ' をまとめ申し込みに選択');
          cb.checked = !!(handlers.selected && handlers.selected.has(String(id)));
          cb.addEventListener('change', function () {
            if (handlers.onToggleSelect) { handlers.onToggleSelect(id, cb.checked); }
          });
          sel.appendChild(cb);
          sel.appendChild(document.createTextNode('まとめ申し込み'));
          actions.appendChild(sel);
        }

        var applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-navy btn-apply';
        applyBtn.textContent = '申し込む';
        applyBtn.addEventListener('click', function () { if (handlers.onApply) { handlers.onApply(practice); } });
        actions.appendChild(applyBtn);
      } else if (myRegId) {
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-cancel';
        cancelBtn.textContent = 'キャンセルする';
        cancelBtn.addEventListener('click', function () { if (handlers.onCancel) { handlers.onCancel(practice); } });
        actions.appendChild(cancelBtn);
      }
    }

    if (handlers.onRoster) {
      var rosterBtn = document.createElement('button');
      rosterBtn.type = 'button';
      rosterBtn.className = 'btn btn-ghost btn-small';
      rosterBtn.textContent = '参加者を見る';
      rosterBtn.addEventListener('click', function () { handlers.onRoster(practice); });
      actions.appendChild(rosterBtn);
    }

    card.appendChild(actions);
    return card;
  }

  // サーバーからのエラーコードを日本語に変換する。未知のコードは
  // そのまま返す (デバッグ時に手がかりを残す)。
  var ERROR_JA = {
    practice_not_found: '練習が見つかりませんでした。',
    practice_cancelled: 'この練習は中止されています。',
    practice_ended: 'この練習はすでに終了しています。',
    already_registered: 'すでに申し込み済みです。',
    already_cancelled: 'すでにキャンセル済みです。',
    invalid_pin: 'PIN が正しくありません。',
    invalid_pin_format: 'PIN は4桁の数字で入力してください。',
    device_locked: 'この端末はロックされています。しばらく待ってからもう一度お試しください。',
    pin_rate_limited: 'PIN の入力間違いが続いたため、一時的にロックされています。しばらく待ってからもう一度お試しください。',
    real_name_mismatch: '本名が一致しません。登録時の本名を入力してください。',
    real_name_required: '本名を入力してください。',
    real_name_rate_limited: '本名の確認に何度も失敗したため、一時的にロックされています。しばらく待ってからもう一度お試しください。',
    member_withdrawn: '退会済みのため申し込めません。',
    member_not_found: 'メンバーが見つかりませんでした。',
    apply_limit_exceeded: '短時間に何度も申し込み・キャンセルをしています。しばらく待ってからもう一度お試しください。',
    too_many_practices: '一度に申し込めるのは50件までです。',
    too_many_requests: '短時間に何度も申請されています。しばらく待ってからもう一度お試しください。',
    duplicate_request: '同じ名前の申請または登録がすでにあります。管理者にお問い合わせください。',
    invalid_kind: '種別が正しくありません。',
    invalid_month: '月が正しくありません。',
    invalid_visibility: '公開/非公開の指定が正しくありません。',
    invalid_video_url: '動画リンクは http:// または https:// で始まる URL を入力してください。',
    // v18 (SQL 22)
    empty_message: 'メッセージを入力してください。',
    message_too_long: 'メッセージは500字以内で入力してください。',
    invalid_skill_level: 'レベルが正しくありません。',
    invalid_team_member: 'チーム分けに確定者でないメンバーが含まれています。',
    team_too_large: '1チームは7人までです。',
    invalid_team_count: 'チーム数は2または3で指定してください。',
    too_few_members: '確定者が2人未満のため、チーム分けできません。',
    not_past_practice: '開催済みの練習にのみ入力できます。',
    not_confirmed: '確定者のみに記録できます。',
    announcement_not_found: 'お知らせが見つかりませんでした。',
    not_private: 'この練習試合・大会は公開のため、招待は必要ありません。',
    already_responded: 'この招待にはすでに回答済みです。',
    invalid_response: '回答の種類が正しくありません。',
    not_found: '招待が見つかりませんでした。',
    unauthorized: 'ログインし直してください。',
    bind_limit: '短時間に何度も端末を切り替えています。しばらく待ってからもう一度お試しください。',
    app_not_available: 'このアカウントはまだアプリを利用できません。利用開始については運営にお問い合わせください。',
    registration_closed: '現在、アプリからの新規登録は受け付けていません。参加希望の方は運営に連絡してください。',
    invalid_device_token: '端末の認証情報が無効です。ログインし直してください。'
  };
  function friendlyError(e) {
    if (!e) { return '通信に失敗しました。'; }
    var code = e.code || '';
    var msg = e.message || String(e);
    if (ERROR_JA[code]) { return ERROR_JA[code]; }
    if (ERROR_JA[msg]) { return ERROR_JA[msg]; }
    for (var k in ERROR_JA) { if (msg.indexOf(k) !== -1) { return ERROR_JA[k]; } }
    return msg || '通信に失敗しました。';
  }

  window.VstarsUI = {
    fmtDateTimeJST: fmtDateTimeJST,
    fmtDateJST: fmtDateJST,
    fmtMonthJST: fmtMonthJST,
    jstTodayStr: jstTodayStr,
    dateKey: dateKey,
    renderCalendarGrid: renderCalendarGrid,
    kindLabel: kindLabel,
    kindClass: kindClass,
    isMatchOrTournament: isMatchOrTournament,
    visibilityLabel: visibilityLabel,
    isPrivate: isPrivate,
    invitationStatusLabel: invitationStatusLabel,
    genderCountsText: genderCountsText,
    esc: esc,
    toast: toast,
    confirmSheet: confirmSheet,
    openSheet: openSheet,
    closeSheet: closeSheet,
    showLoading: showLoading,
    showError: showError,
    showEmpty: showEmpty,
    genderLabel: genderLabel,
    positionLabel: positionLabel,
    skillLevelLabel: skillLevelLabel,
    teamLabel: teamLabel,
    statusLabel: statusLabel,
    statusClass: statusClass,
    friendlyError: friendlyError,
    csvDownload: csvDownload,
    csvEscape: csvEscape,
    renderPracticeCard: renderPracticeCard
  };
})();
