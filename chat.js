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
    if (msg.indexOf('message_not_found') !== -1) { return 'メッセージが見つかりませんでした。'; }
    if (msg.indexOf('invalid_reaction') !== -1) { return 'そのリアクションは使えません。'; }
    if (msg.indexOf('unsupported_file_type') !== -1) { return '送れるのは画像（JPG・PNGなど）とPDFだけです。'; }
    if (msg.indexOf('file_too_large') !== -1) { return 'ファイルは10MBまでです。'; }
    if (msg.indexOf('invalid_attachment') !== -1) { return 'ファイルの送信に失敗しました。もう一度お試しください。'; }
    if (msg.indexOf('attachment_expired') !== -1) { return '保存期間（1か月）を過ぎたため削除されました。'; }
    if (msg.indexOf('upload_failed') !== -1) { return 'アップロードに失敗しました。通信環境を確認してもう一度お試しください。'; }
    return UI().friendlyError ? UI().friendlyError(e) : msg;
  }

  // リアクション (SQL 33): 絵文字6種 + バレースタンプ3種 (画像は stamps/)。
  // DB 側の許可セットと一致させること。絵文字はコードポイントをエスケープで固定。
  var REACTIONS = [
    { key: '\u{1F44D}', label: 'いいね' },
    { key: '\u2764\uFE0F', label: 'すき' },
    { key: '\u{1F602}', label: '笑い' },
    { key: '\u{1F62E}', label: 'すごい' },
    { key: '\u{1F64F}', label: 'ありがとう・お願い' },
    { key: '\u{1F3D0}', label: 'バレーボール' },
    { key: 'stamp_nice', img: 'stamps/nice.png', label: 'ナイス！' },
    { key: 'stamp_donmai', img: 'stamps/donmai.png', label: 'ドンマイ' },
    { key: 'stamp_otsukare', img: 'stamps/otsukare.png', label: 'おつかれさま' }
  ];
  function reactionDef(key) {
    for (var i = 0; i < REACTIONS.length; i++) {
      if (REACTIONS[i].key === key) { return REACTIONS[i]; }
    }
    return { key: key, label: key };
  }
  function reactionContent(def) {
    if (def.img) {
      var img = document.createElement('img');
      img.src = def.img;
      img.alt = def.label || '';
      img.className = 'chat-stamp';
      return img;
    }
    var s = document.createElement('span');
    s.textContent = def.key;
    return s;
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

    // 添付ファイルのプレビュー帯 (選んでいる間だけコンポーザーの上に表示)。
    var fileBar = document.createElement('div');
    fileBar.className = 'chat-filebar';
    fileBar.hidden = true;
    overlay.appendChild(fileBar);

    var form = document.createElement('form');
    form.className = 'chat-composer';
    var attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'chat-attach-btn';
    attachBtn.textContent = '📎';
    attachBtn.setAttribute('aria-label', 'ファイルを添付（画像・PDF）');
    form.appendChild(attachBtn);
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf,.pdf';
    fileInput.hidden = true;
    form.appendChild(fileInput);
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

    // リアクション選択バー (選んでいる間だけ入力欄の上に表示)。
    var picker = document.createElement('div');
    picker.className = 'chat-picker';
    picker.hidden = true;
    overlay.insertBefore(picker, form);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var seen = new Set();
    var rowsById = {};          // message_id -> 行要素 (リアクション更新用)
    var pickerFor = null;       // ピッカーが対象にしている message_id
    var lastCreatedAt = null;   // 最新メッセージの created_at (ポーリング用)
    var firstCreatedAt = null;  // 最古メッセージの created_at (遡り用)
    var lastDayKey = null;
    var timer = null;
    var closed = false;
    var pendingFile = null;     // 送信待ちの添付ファイル (File)
    var attUrlCache = {};       // message_id -> Promise<string> (署名URL)
    var lastLongPressAt = 0;    // 長押し直後の click を抑止するため

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

    // --- リアクション (SQL 33) -------------------------------------------
    REACTIONS.forEach(function (def) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-picker-item';
      b.setAttribute('data-reaction', def.key);
      b.setAttribute('aria-label', def.label);
      b.appendChild(reactionContent(def));
      b.addEventListener('click', function () { chooseReaction(def.key); });
      picker.appendChild(b);
    });

    function markPickerSelection() {
      var row = pickerFor ? rowsById[pickerFor] : null;
      var mine = row ? row._myReaction : null;
      Array.prototype.forEach.call(picker.children, function (b) {
        if (b.getAttribute('data-reaction') === mine) { b.classList.add('selected'); }
        else { b.classList.remove('selected'); }
      });
    }
    function openPicker(messageId) {
      if (pickerFor === messageId && !picker.hidden) {
        picker.hidden = true;
        pickerFor = null;
        return;
      }
      pickerFor = messageId;
      picker.hidden = false;
      markPickerSelection();
    }
    function chooseReaction(key) {
      var target = pickerFor;
      picker.hidden = true;
      pickerFor = null;
      if (target) { doReact(target, key); }
    }
    async function doReact(messageId, key) {
      if (mode === 'admin') { return; }
      try {
        var res = await Api().reactToPracticeMessage(messageId, key);
        var row = rowsById[messageId];
        if (row && res) { updateReactions(row, res); }
      } catch (e) {
        UI().toast('リアクションに失敗しました。' + friendlyError(e));
      }
    }
    function updateReactions(row, data) {
      var wrap = row.querySelector('.chat-reactions');
      if (!wrap) { return; }
      var reactions = (data && Array.isArray(data.reactions)) ? data.reactions : [];
      var mine = data ? data.my_reaction : null;
      var sig = JSON.stringify([reactions, mine]);
      if (row._rsig === sig) { return; }
      row._rsig = sig;
      row._myReaction = mine;
      wrap.innerHTML = '';
      reactions.forEach(function (item) {
        var def = reactionDef(item.reaction);
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chat-chip' + (item.reaction === mine ? ' mine' : '');
        chip.appendChild(reactionContent(def));
        var cnt = document.createElement('span');
        cnt.className = 'chat-chip-count';
        cnt.textContent = String(item.count);
        chip.appendChild(cnt);
        // タップ: メンバーはリアクション付け替え (従来通り)、管理者は明細。
        // 長押し: どちらのモードでも「誰が押したか」を表示する。
        chip.addEventListener('click', function () {
          if (Date.now() - lastLongPressAt < 600) { return; }
          if (mode !== 'admin') {
            doReact(row.getAttribute('data-message-id'), item.reaction);
          } else {
            openWhoSheet(row.getAttribute('data-message-id'));
          }
        });
        attachLongPress(chip, function () {
          openWhoSheet(row.getAttribute('data-message-id'));
        });
        wrap.appendChild(chip);
      });
    }

    // --- 添付ファイル (SQL 37) ------------------------------------------
    function clearPendingFile() {
      pendingFile = null;
      fileBar.hidden = true;
      fileBar.innerHTML = '';
      fileInput.value = '';
    }
    function setPendingFile(file) {
      if (!file) { return; }
      var pure = window.V19Pure || {};
      if (pure.validateAttachment) {
        var chk = pure.validateAttachment(file.type, file.size);
        if (!chk.ok) {
          UI().toast(friendlyError(new Error(chk.error)));
          return;
        }
      }
      pendingFile = file;
      fileBar.innerHTML = '';
      var label = document.createElement('span');
      label.className = 'chat-filebar-name';
      label.textContent = '📎 ' + file.name + (pure.formatFileSize ? '（' + pure.formatFileSize(file.size) + '）' : '');
      fileBar.appendChild(label);
      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn btn-ghost btn-small';
      clearBtn.textContent = '✕ 外す';
      clearBtn.addEventListener('click', clearPendingFile);
      fileBar.appendChild(clearBtn);
      fileBar.hidden = false;
    }
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) { setPendingFile(fileInput.files[0]); }
      fileInput.value = '';
    });

    // 画像は長辺1600px・JPEG 0.82 に圧縮してから送る (GIFはそのまま)。
    function prepareUpload(file) {
      var name = file.name || 'ファイル';
      if (!file.type || file.type.indexOf('image/') !== 0 || file.type === 'image/gif') {
        return Promise.resolve({ blob: file, name: name });
      }
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          try {
            var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(function (blob) {
              if (blob) {
                resolve({ blob: blob, name: name.replace(/\.[^.]*$/, '') + '.jpg' });
              } else {
                resolve({ blob: file, name: name });
              }
            }, 'image/jpeg', 0.82);
          } catch (e) {
            URL.revokeObjectURL(url);
            resolve({ blob: file, name: name });
          }
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          resolve({ blob: file, name: name });
        };
        img.src = url;
      });
    }

    function attachmentUrl(messageId) {
      if (!attUrlCache[messageId]) {
        attUrlCache[messageId] = Api().getChatAttachmentUrl(mode, messageId)
          .then(function (r) { return r.url; });
        // 失敗時はキャッシュを消して次回再試行できるようにする。
        attUrlCache[messageId].catch(function () { delete attUrlCache[messageId]; });
      }
      return attUrlCache[messageId];
    }

    function openImageViewer(url) {
      var viewer = document.createElement('div');
      viewer.className = 'chat-img-viewer';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '添付画像';
      viewer.appendChild(img);
      var hint = document.createElement('div');
      hint.className = 'chat-img-viewer-hint';
      hint.textContent = 'タップで閉じる';
      viewer.appendChild(hint);
      viewer.addEventListener('click', function () { viewer.remove(); });
      overlay.appendChild(viewer);
    }

    function renderAttachment(m, bubble) {
      var pure = window.V19Pure || {};
      var kind = pure.attachmentKind ? pure.attachmentKind(m.attachment_mime) : null;
      if (m.attachment_path && kind === 'image') {
        var img = document.createElement('img');
        img.className = 'chat-att-img';
        img.alt = m.attachment_name || '添付画像';
        img.addEventListener('click', function () {
          attachmentUrl(m.message_id).then(openImageViewer).catch(function (e) {
            UI().toast(friendlyError(e));
          });
        });
        attachmentUrl(m.message_id).then(function (u) { img.src = u; }).catch(function () {
          img.alt = '画像を表示できませんでした';
        });
        bubble.appendChild(img);
        return;
      }
      if (m.attachment_path && kind === 'pdf') {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'chat-att-card';
        var nm = document.createElement('span');
        nm.textContent = '📎 ' + (m.attachment_name || 'ファイル');
        card.appendChild(nm);
        var sz = document.createElement('span');
        sz.className = 'chat-att-size';
        sz.textContent = pure.formatFileSize ? pure.formatFileSize(m.attachment_size) : '';
        card.appendChild(sz);
        card.addEventListener('click', function () {
          attachmentUrl(m.message_id).then(function (u) {
            window.open(u, '_blank');
          }).catch(function (e) {
            UI().toast(friendlyError(e));
          });
        });
        bubble.appendChild(card);
        return;
      }
      if (!m.attachment_path && m.attachment_name) {
        var exp = document.createElement('div');
        exp.className = 'chat-att-expired';
        exp.textContent = '添付ファイルは保存期間（1か月）を過ぎたため削除されました';
        bubble.appendChild(exp);
      }
    }

    // --- リアクション明細 (誰が押したか) --------------------------------
    function attachLongPress(el, fn) {
      var t = null;
      el.addEventListener('pointerdown', function () {
        t = window.setTimeout(function () {
          lastLongPressAt = Date.now();
          fn();
        }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        el.addEventListener(ev, function () {
          if (t) { window.clearTimeout(t); t = null; }
        });
      });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    async function openWhoSheet(messageId) {
      var sheet = document.createElement('div');
      sheet.className = 'chat-who-backdrop';
      var panel = document.createElement('div');
      panel.className = 'chat-who-panel';
      var headRow = document.createElement('div');
      headRow.className = 'chat-who-head';
      var hTitle = document.createElement('div');
      hTitle.className = 'chat-who-title';
      hTitle.textContent = 'リアクションした人';
      headRow.appendChild(hTitle);
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-ghost btn-small';
      closeBtn.textContent = '閉じる';
      headRow.appendChild(closeBtn);
      panel.appendChild(headRow);
      var bodyEl = document.createElement('div');
      bodyEl.className = 'chat-who-body';
      bodyEl.textContent = '読み込み中…';
      panel.appendChild(bodyEl);
      sheet.appendChild(panel);
      overlay.appendChild(sheet);
      function closeSheet() { sheet.remove(); }
      closeBtn.addEventListener('click', closeSheet);
      sheet.addEventListener('click', function (e) {
        if (e.target === sheet) { closeSheet(); }
      });
      try {
        var rows = mode === 'admin'
          ? await Api().adminListMessageReactions(messageId)
          : await Api().listMessageReactions(messageId);
        bodyEl.innerHTML = '';
        var list = Array.isArray(rows) ? rows : [];
        if (list.length === 0) {
          bodyEl.textContent = 'まだリアクションはありません。';
          return;
        }
        var groups = [];
        var byKey = {};
        list.forEach(function (r) {
          if (!byKey[r.reaction]) {
            byKey[r.reaction] = [];
            groups.push(r.reaction);
          }
          byKey[r.reaction].push(r.member_name || '');
        });
        groups.forEach(function (key) {
          var g = document.createElement('div');
          g.className = 'chat-who-group';
          var icon = document.createElement('span');
          icon.className = 'chat-who-icon';
          icon.appendChild(reactionContent(reactionDef(key)));
          g.appendChild(icon);
          var names = document.createElement('span');
          names.className = 'chat-who-names';
          names.textContent = byKey[key].join('、');
          g.appendChild(names);
          bodyEl.appendChild(g);
        });
      } catch (e) {
        bodyEl.textContent = '';
        var errP = document.createElement('p');
        errP.className = 'danger-text';
        errP.textContent = friendlyError(e);
        bodyEl.appendChild(errP);
      }
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
      rowsById[m.message_id] = row;
      if (!m.is_mine) {
        var name = document.createElement('div');
        name.className = 'chat-name';
        name.textContent = m.sender_name || '';
        row.appendChild(name);
      }
      var bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      if (m.attachment_path || m.attachment_name) { renderAttachment(m, bubble); }
      if (m.message) {
        var txt = document.createElement('div');
        txt.textContent = m.message;
        bubble.appendChild(txt);
      }
      row.appendChild(bubble);
      var meta = document.createElement('div');
      meta.className = 'chat-meta';
      var time = document.createElement('span');
      time.textContent = fmtTime(m.created_at);
      meta.appendChild(time);
      if (mode !== 'admin') {
        var reactBtn = document.createElement('button');
        reactBtn.type = 'button';
        reactBtn.className = 'chat-react-btn';
        reactBtn.textContent = '＋';
        reactBtn.setAttribute('aria-label', 'リアクションを追加');
        reactBtn.addEventListener('click', function () { openPicker(m.message_id); });
        meta.appendChild(reactBtn);
      }
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
      var rwrap = document.createElement('div');
      rwrap.className = 'chat-reactions';
      row.appendChild(rwrap);
      updateReactions(row, m);
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

    // 表示済みメッセージのリアクションだけを最新化する (他人のリアクション反映)。
    function refreshReactions(rows) {
      (Array.isArray(rows) ? rows : []).forEach(function (m) {
        var row = rowsById[m.message_id];
        if (row) { updateReactions(row, m); }
      });
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
          refreshReactions(firstList);
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
        // 既存メッセージへのリアクションは after 取得では来ないので、
        // 最新ページを取り直してチップだけ更新する。
        var latest = await listFn({});
        refreshReactions(latest);
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
      var text = ta.value.trim();
      if (pendingFile) {
        if (text.length > 1000) {
          UI().toast('1000文字以内で入力してください。');
          return;
        }
        sendBtn.disabled = true;
        attachBtn.disabled = true;
        try {
          var prep = await prepareUpload(pendingFile);
          var pure = window.V19Pure || {};
          if (pure.validateAttachment) {
            var chk = pure.validateAttachment(prep.blob.type || pendingFile.type, prep.blob.size);
            if (!chk.ok) { throw new Error(chk.error); }
          }
          var up = await Api().uploadChatAttachment(mode, practiceId, prep.blob, prep.name);
          var att = { path: up.path, name: up.name || prep.name, mime: up.mime, size: up.size };
          if (mode === 'admin') {
            await Api().adminPostPracticeMessageAttachment(practiceId, text, att);
          } else {
            await Api().postPracticeMessageAttachment(practiceId, text, att);
          }
          ta.value = '';
          clearPendingFile();
          await poll();
          scrollBottom();
        } catch (ex) {
          UI().toast('送信に失敗しました。' + friendlyError(ex));
        }
        sendBtn.disabled = false;
        attachBtn.disabled = false;
        return;
      }
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
