/* Vstars 出欠 — 練習試合・大会チャット (SQL 29)
 * 催しごとの参加者チャットを全画面オーバーレイで表示する。
 * mode: 'member' (メンバー用RPC) | 'admin' (管理用RPC、メッセージ削除可)
 * 新着は10秒ポーリング (p_after) で取り込む。オーバーレイが閉じられたら
 * ポーリングは自動で止まる。表示は全て textContent (XSS 対策)。
 */
'use strict';

(function () {
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  var timeFmt = null;
  var dayFmt = null;
  function fmtTime(iso) {
    try {
      if (!timeFmt) {
        timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
      }
      return timeFmt.format(new Date(iso));
    } catch (e) { return ''; }
  }
  function fmtDay(iso) {
    try {
      if (!dayFmt) {
        dayFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
      }
      return dayFmt.format(new Date(iso));
    } catch (e) { return ''; }
  }
  function dayKey(iso) {
    try {
      return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  function friendlyError(e) {
    var msg = (e && e.message) || '';
    if (msg.indexOf('not_participant') !== -1) { return 'このチャットは参加者専用です（申込または招待が必要です）。'; }
    if (msg.indexOf('chat_not_available') !== -1) { return 'この催しにはチャットがありません。'; }
    if (msg.indexOf('unauthorized') !== -1) { return 'ログインし直してください。'; }
    if (msg.indexOf('message_too_long') !== -1) { return '1000文字以内で入力してください。'; }
    if (msg.indexOf('empty_message') !== -1) { return 'メッセージを入力してください。'; }
    return UI().friendlyError ? UI().friendlyError(e) : msg;
  }

  var currentClose = null;

  function open(opts) {
    var practiceId = opts.practiceId;
    var mode = opts.mode === 'admin' ? 'admin' : 'member';
    // 既に開いているチャットがあれば閉じてから開く (多重表示防止)。
    if (currentClose) { currentClose(); }
    // 同じ催しのチャットが既に開いていたら二重に開かない。
    var existing = document.querySelector('.chat-overlay[data-practice-id="' + practiceId + '"]');
    if (existing) { return; }

    var overlay = document.createElement('div');
    overlay.className = 'chat-overlay';
    overlay.setAttribute('data-practice-id', practiceId);

    var head = document.createElement('div');
    head.className = 'chat-head';
    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-ghost btn-small';
    backBtn.textContent = '← 戻る';
    head.appendChild(backBtn);
    var title = document.createElement('div');
    title.className = 'chat-title';
    title.textContent = opts.title || 'チャット';
    head.appendChild(title);
    overlay.appendChild(head);

    var olderWrap = document.createElement('div');
    olderWrap.className = 'chat-older';
    var olderBtn = document.createElement('button');
    olderBtn.type = 'button';
    olderBtn.className = 'btn btn-ghost btn-small';
    olderBtn.textContent = '前のメッセージを読む';
    olderBtn.hidden = true;
    olderWrap.appendChild(olderBtn);
    overlay.appendChild(olderWrap);

    var listEl = document.createElement('div');
    listEl.className = 'chat-messages';
    overlay.appendChild(listEl);

    var form = document.createElement('form');
    form.className = 'chat-composer';
    var ta = document.createElement('textarea');
    ta.className = 'chat-input';
    ta.rows = 2;
    ta.maxLength = 1000;
    ta.placeholder = 'メッセージを入力（1000文字まで）';
    form.appendChild(ta);
    var sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'btn btn-navy';
    sendBtn.textContent = '送信';
    form.appendChild(sendBtn);
    overlay.appendChild(form);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var seen = new Set();
    var lastCreatedAt = null;   // 最新メッセージの created_at (ポーリング用)
    var firstCreatedAt = null;  // 最古メッセージの created_at (遡り用)
    var lastDayKey = null;
    var timer = null;
    var closed = false;

    function close() {
      if (closed) { return; }
      closed = true;
      if (timer) { window.clearInterval(timer); }
      window.removeEventListener('hashchange', onHash);
      overlay.remove();
      document.body.style.overflow = '';
      if (currentClose === close) { currentClose = null; }
      // ディープリンク (#/practice/<id>/chat) のまま閉じると、一覧の
      // 自動更新のたびに再び開いてしまうので、履歴だけ一覧へ戻す。
      if ((window.location.hash || '').indexOf('/practice/' + practiceId + '/chat') !== -1) {
        try { window.history.replaceState(null, '', '#/practices'); } catch (e) {}
      }
    }
    currentClose = close;
    function onHash() { close(); }
    backBtn.addEventListener('click', close);
    window.addEventListener('hashchange', onHash);

    function nearBottom() {
      return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
    }
    function scrollBottom() {
      listEl.scrollTop = listEl.scrollHeight;
    }

    function renderMessage(m, prepend) {
      if (seen.has(m.message_id)) { return null; }
      seen.add(m.message_id);
      var emptyNote = listEl.querySelector('.chat-empty');
      if (emptyNote) { emptyNote.remove(); }
      var dk = dayKey(m.created_at);
      var frag = document.createDocumentFragment();
      var anchor = null;
      if (!prepend && dk !== lastDayKey) {
        var div = document.createElement('div');
        div.className = 'chat-date';
        div.textContent = fmtDay(m.created_at);
        frag.appendChild(div);
        lastDayKey = dk;
      }
      var row = document.createElement('div');
      row.className = 'chat-row' + (m.is_mine ? ' mine' : '');
      row.setAttribute('data-message-id', m.message_id);
      if (!m.is_mine) {
        var name = document.createElement('div');
        name.className = 'chat-name';
        name.textContent = m.sender_name || '';
        row.appendChild(name);
      }
      var bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = m.message || '';
      row.appendChild(bubble);
      var meta = document.createElement('div');
      meta.className = 'chat-meta';
      var time = document.createElement('span');
      time.textContent = fmtTime(m.created_at);
      meta.appendChild(time);
      if (mode === 'admin') {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'chat-del';
        del.textContent = '削除';
        del.addEventListener('click', async function () {
          var ok = await UI().confirmSheet({
            title: 'メッセージを削除しますか？',
            body: 'このメッセージを削除します。',
            okLabel: '削除する', danger: true
          });
          if (!ok) { return; }
          try {
            await Api().adminDeletePracticeMessage(m.message_id);
            row.remove();
            UI().toast('メッセージを削除しました。');
          } catch (e) {
            UI().toast('削除に失敗しました。' + friendlyError(e));
          }
        });
        meta.appendChild(del);
      }
      row.appendChild(meta);
      frag.appendChild(row);
      anchor = row;
      if (prepend) {
        listEl.insertBefore(frag, listEl.firstChild);
      } else {
        listEl.appendChild(frag);
      }
      return anchor;
    }

    function listFn(args) {
      return mode === 'admin'
        ? Api().adminListPracticeMessages(practiceId, args)
        : Api().listPracticeMessages(practiceId, args);
    }

    async function loadInitial() {
      listEl.innerHTML = '<p class="muted" style="text-align:center">読み込み中…</p>';
      try {
        var rows = await listFn({});
        var list = Array.isArray(rows) ? rows.slice().reverse() : [];
        listEl.innerHTML = '';
        if (list.length === 0) {
          listEl.innerHTML = '<p class="muted chat-empty" style="text-align:center">まだメッセージはありません。最初の連絡を送ってみましょう。</p>';
        }
        list.forEach(function (m) { renderMessage(m, false); });
        if (list.length > 0) {
          firstCreatedAt = list[0].created_at;
          lastCreatedAt = list[list.length - 1].created_at;
        }
        olderBtn.hidden = list.length < 100;
        scrollBottom();
      } catch (e) {
        listEl.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'danger-text';
        p.style.textAlign = 'center';
        p.textContent = friendlyError(e);
        listEl.appendChild(p);
        form.style.display = 'none';
      }
    }

    async function poll() {
      if (closed || !document.contains(overlay)) { close(); return; }
      if (document.hidden) { return; }
      var wasNear = nearBottom();
      try {
        if (!lastCreatedAt) {
          // まだ1件もない場合は最新ページを取り直して未表示分を足す。
          var initial = await listFn({});
          var firstList = Array.isArray(initial) ? initial.slice().reverse() : [];
          var addedFirst = false;
          firstList.forEach(function (m) {
            if (renderMessage(m, false)) {
              addedFirst = true;
              if (!lastCreatedAt || m.created_at > lastCreatedAt) { lastCreatedAt = m.created_at; }
              if (!firstCreatedAt) { firstCreatedAt = m.created_at; }
            }
          });
          if (addedFirst && wasNear) { scrollBottom(); }
          return;
        }
        var rows = await listFn({ after: lastCreatedAt });
        var list = Array.isArray(rows) ? rows : [];
        var added = false;
        list.forEach(function (m) {
          if (renderMessage(m, false)) {
            added = true;
            if (!lastCreatedAt || m.created_at > lastCreatedAt) { lastCreatedAt = m.created_at; }
          }
        });
        if (added && wasNear) { scrollBottom(); }
      } catch (e) { /* ポーリング失敗は静かに無視 (次周期で再試行) */ }
    }

    olderBtn.addEventListener('click', async function () {
      if (!firstCreatedAt) { return; }
      olderBtn.disabled = true;
      try {
        var rows = await listFn({ before: firstCreatedAt });
        var list = Array.isArray(rows) ? rows : []; // 降順で返る
        // 既存の先頭より前に、古い順で差し込む。
        var prevHeight = listEl.scrollHeight;
        // 日付区切りは遡り側では付けない (境界の重複を避ける)。
        list.slice().reverse().forEach(function (m) { renderMessage(m, true); });
        if (list.length > 0) { firstCreatedAt = list[list.length - 1].created_at; }
        olderBtn.hidden = list.length < 100;
        listEl.scrollTop = listEl.scrollHeight - prevHeight;
      } catch (e) {
        UI().toast('読み込みに失敗しました。' + friendlyError(e));
      }
      olderBtn.disabled = false;
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var v = window.V19Pure && window.V19Pure.validateChatMessage
        ? window.V19Pure.validateChatMessage(ta.value)
        : { ok: true };
      if (!v.ok) {
        UI().toast(v.error === 'message_too_long' ? '1000文字以内で入力してください。' : 'メッセージを入力してください。');
        return;
      }
      sendBtn.disabled = true;
      try {
        if (mode === 'admin') {
          await Api().adminPostPracticeMessage(practiceId, ta.value.trim());
        } else {
          await Api().postPracticeMessage(practiceId, ta.value.trim());
        }
        ta.value = '';
        await poll();
        scrollBottom();
      } catch (ex) {
        UI().toast('送信に失敗しました。' + friendlyError(ex));
      }
      sendBtn.disabled = false;
    });

    loadInitial();
    timer = window.setInterval(poll, 10000);
  }

  window.VstarsChat = { open: open };
})();
