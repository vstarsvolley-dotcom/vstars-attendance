/* Vstars 出欠 — UI 共通部品
 * 日付表示はすべて Asia/Tokyo (JST)。状態は必ずテキストで表示する (色だけにしない)。
 */
'use strict';

(function () {
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  var toastTimer = null;

  function parseDate(value) {
    if (!value) { return null; }
    if (value instanceof Date) { return value; }
    // 'YYYY-MM-DD' は UTC 扱いにならないようローカルで組み立てる
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (m) { return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)); }
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
    var weekday = WEEKDAYS[d.getDay()];
    // timestamptz の場合は JST の曜日を使う
    if (typeof date === 'string' && (date.indexOf('T') !== -1 || date.indexOf('+') !== -1 || date.indexOf('Z') !== -1)) {
      var wd = p.weekday.replace('曜日', '');
      weekday = wd || weekday;
    }
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
    var weekday = WEEKDAYS[d.getDay()];
    if (typeof date === 'string' && (date.indexOf('T') !== -1 || date.indexOf('+') !== -1 || date.indexOf('Z') !== -1)) {
      weekday = p.weekday.replace('曜日', '') || weekday;
    }
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

  function positionLabel(p) {
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

  // 練習カードの DOM を作る。handlers: {onApply, onCancel, onRoster, onToggleSelect, selected}
  function renderPracticeCard(practice, handlers) {
    handlers = handlers || {};
    var id = practice.practice_id || practice.id;
    var date = practice.practice_date || practice.date;
    var confirmed = practice.confirmed_count !== undefined ? practice.confirmed_count
      : (practice.confirmedCount !== undefined ? practice.confirmedCount : 0);
    var capacity = practice.capacity !== undefined ? practice.capacity : 18;
    var waitlist = practice.waitlist_count !== undefined ? practice.waitlist_count
      : (practice.waitlistCount !== undefined ? practice.waitlistCount : 0);
    var cancelled = practice.is_cancelled || practice.cancelled || practice.status === 'cancelled';
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
    counts.textContent = '確定 ' + confirmed + ' / ' + capacity + '名'
      + (waitlist > 0 ? '　待ち ' + waitlist + '名' : '');
    card.appendChild(counts);

    if (cancelled) {
      var cx = document.createElement('p');
      cx.className = 'practice-cancelled-note';
      cx.textContent = 'この練習は中止になりました。' + (practice.cancel_reason ? '（' + practice.cancel_reason + '）' : '');
      card.appendChild(cx);
    }

    var actions = document.createElement('div');
    actions.className = 'practice-actions';

    if (!cancelled) {
      if (myStatus === '未申込') {
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

  window.VstarsUI = {
    fmtDateTimeJST: fmtDateTimeJST,
    fmtDateJST: fmtDateJST,
    fmtMonthJST: fmtMonthJST,
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
    statusLabel: statusLabel,
    statusClass: statusClass,
    csvDownload: csvDownload,
    csvEscape: csvEscape,
    renderPracticeCard: renderPracticeCard
  };
})();
