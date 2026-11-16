/* Vstars 出欠 — 練習一覧画面
 * list_practices → カード表示。56px の申し込むボタン、確認シート付きキャンセル、
 * チェックボックス複数選択 + 下部バーでまとめ申し込み、参加者表示 (LINE 名のみ)。
 */
'use strict';

(function () {
  var selected = new Set();
  var practicesCache = [];

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
    Api().listPractices().then(function (rows) {
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
    lead.textContent = '申し込みたい練習を選んでください。定員を超えた場合は待ちになります。';
    view.appendChild(lead);

    if (practicesCache.length === 0) {
      UI().showEmpty(view, '申し込める練習がありません。');
      return;
    }

    var list = document.createElement('div');
    list.className = 'practice-list';
    practicesCache.forEach(function (p) {
      var card = UI().renderPracticeCard(p, {
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
      UI().toast('申し込めませんでした。' + (e && e.message ? ' ' + e.message : ''));
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
      await Api().applyBulk(ids);
      UI().toast(ids.length + '件申し込みました。');
      renderPractices();
    } catch (e) {
      UI().toast('まとめ申し込みに失敗しました。' + (e && e.message ? ' ' + e.message : ''));
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
      UI().toast('キャンセルできませんでした。' + (e && e.message ? ' ' + e.message : ''));
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

  window.VstarsMemberPractices = {
    renderPractices: renderPractices,
    clearSelection: function () { selected = new Set(); updateBulkBar(); }
  };
})();
