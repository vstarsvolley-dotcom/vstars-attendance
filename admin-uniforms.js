/* Vstars 出欠 — 管理: ユニフォーム管理 (SQL 36)
 * 1st / 2nd ユニフォームの在庫・持ち主・支払い・貸し出しを管理する。
 * 持ち主は「メンバー / アプリ外の人 (名前) / 運営在庫」の3通り。
 * 支払いは持ち主がいるときだけ意味を持つ (在庫は対象外)。
 * ルートは admin-app.js の #/admin/uniforms。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }
  function Pure() { return window.V19Pure; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
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

  function inputOf(type, value) {
    var i = document.createElement('input');
    i.type = type;
    if (value !== undefined && value !== null) { i.value = value; }
    return i;
  }

  function selectOf(options, value) {
    var sel = document.createElement('select');
    options.forEach(function (kv) {
      var o = document.createElement('option');
      o.value = kv[0];
      o.textContent = kv[1];
      sel.appendChild(o);
    });
    if (value !== undefined && value !== null) { sel.value = String(value); }
    return sel;
  }

  function addBtn(parent, label, cls, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small ' + cls;
    btn.textContent = label;
    btn.addEventListener('click', fn);
    parent.appendChild(btn);
    return btn;
  }

  function renderAdminUniforms() {
    var view = App().adminHeader(viewEl(), 'uniforms', 'ユニフォーム管理');

    var state = { kind: 'first', rows: [], members: [] };

    // --- 種類切替 (セグメント) ---
    var seg = document.createElement('div');
    seg.className = 'practice-actions';
    seg.style.marginBottom = '12px';
    var segBtns = {};
    [['first', '1stユニフォーム'], ['second', '2ndユニフォーム']].forEach(function (kv) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = kv[1];
      b.addEventListener('click', function () {
        state.kind = kv[0];
        paintSeg();
        paintList();
      });
      segBtns[kv[0]] = b;
      seg.appendChild(b);
    });
    view.appendChild(seg);
    function paintSeg() {
      Object.keys(segBtns).forEach(function (k) {
        segBtns[k].className = 'btn ' + (k === state.kind ? 'btn-navy' : 'btn-ghost');
      });
    }
    paintSeg();

    // --- 未払いサマリ ---
    var summary = el('p', 'muted', '');
    view.appendChild(summary);
    function paintSummary() {
      var c = Pure().uniformUnpaidCounts(state.rows);
      summary.textContent = '未払い: 1st ' + c.first + '件 / 2nd ' + c.second
        + '件（合計 ' + c.total + '件）';
    }

    // --- 新規追加 ---
    var addWrap = document.createElement('div');
    view.appendChild(addWrap);
    var addBtn = addBtn(addWrap, '＋ ユニフォームを追加', 'btn-navy', function () {
      addWrap.innerHTML = '';
      addWrap.appendChild(buildForm(null));
    });
    addBtn.className = 'btn btn-navy';

    var listWrap = document.createElement('div');
    listWrap.style.marginTop = '16px';
    view.appendChild(listWrap);

    function memberOptions(selectedId) {
      var opts = [['', '選択してください']];
      state.members.forEach(function (m) {
        opts.push([m.id, (m.line_name || m.real_name || '') + '（No.' + m.member_no + '）']);
      });
      return opts;
    }

    // --- 編集/追加フォーム ---
    function buildForm(row) {
      var isNew = !row;
      var form = el('form', 'form practice-card');
      var title = el('h3', null, isNew ? 'ユニフォームを追加' : 'ユニフォームを編集');
      title.style.marginTop = '0';
      form.appendChild(title);

      var kindSel = selectOf([['first', '1st'], ['second', '2nd']],
        isNew ? state.kind : row.kind);
      fieldRow(form, '種類', kindSel);

      var numberInput = inputOf('number', isNew ? '' : row.number);
      numberInput.min = '1';
      numberInput.required = true;
      fieldRow(form, '番号', numberInput);

      var sizeInput = inputOf('text', isNew ? '' : row.size);
      sizeInput.required = true;
      sizeInput.placeholder = '例: M / L / O / XO / 2XO / XL / 2XL / 3XL';
      fieldRow(form, 'サイズ', sizeInput);

      var printInput = inputOf('text', isNew ? '' : (row.print_name || ''));
      printInput.placeholder = '2ndのみ。例: HOSHI';
      fieldRow(form, 'プリント名（2nd用）', printInput);

      var holderMode = !isNew && row.holder_member_id ? 'member'
        : (!isNew && row.holder_name ? 'external' : 'stock');
      var modeSel = selectOf(
        [['stock', '運営在庫'], ['member', 'メンバー'], ['external', 'アプリ外の人']],
        holderMode);
      fieldRow(form, '持ち主の種類', modeSel);

      var memberSel = selectOf(memberOptions(), isNew ? '' : (row.holder_member_id || ''));
      var memberRow = fieldRow(form, '持ち主（メンバー）', memberSel);
      var nameInput = inputOf('text', isNew ? '' : (row.holder_name || ''));
      nameInput.placeholder = '例: ななちゃん';
      var nameRow = fieldRow(form, '持ち主（名前）', nameInput);
      var paidSel = selectOf([['false', '未払い'], ['true', '支払い済']],
        !isNew && row.paid ? 'true' : 'false');
      var paidRow = fieldRow(form, '支払い', paidSel);

      function paintHolderFields() {
        memberRow.style.display = modeSel.value === 'member' ? '' : 'none';
        nameRow.style.display = modeSel.value === 'external' ? '' : 'none';
        paidRow.style.display = modeSel.value === 'stock' ? 'none' : '';
      }
      modeSel.addEventListener('change', paintHolderFields);
      paintHolderFields();

      var noteInput = inputOf('text', isNew ? '' : (row.note || ''));
      fieldRow(form, 'メモ', noteInput);

      var actions = document.createElement('div');
      actions.className = 'practice-actions';
      var saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn btn-navy btn-small';
      saveBtn.textContent = isNew ? '追加する' : '保存する';
      actions.appendChild(saveBtn);
      addBtn(actions, 'キャンセル', 'btn-ghost', function () { paintList(); resetAdd(); });
      if (!isNew) {
        addBtn(actions, '削除', 'btn-cancel', async function () {
          var ok = await UI().confirmSheet({
            title: 'ユニフォームを削除しますか？',
            body: 'No.' + row.number + '（' + (row.kind === 'first' ? '1st' : '2nd')
              + '）を削除します。貸出履歴も一緒に消えます。',
            okLabel: '削除する', danger: true
          });
          if (!ok) { return; }
          try {
            await Api().adminDeleteUniform(row.id);
            UI().toast('削除しました。');
            reload();
          } catch (e) {
            UI().toast('削除に失敗しました。' + UI().friendlyError(e));
          }
        });
      }
      form.appendChild(actions);

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var number = parseInt(numberInput.value, 10);
        if (isNaN(number) || number <= 0) {
          UI().toast('番号は1以上の整数で入力してください。');
          return;
        }
        var u = {
          id: isNew ? null : row.id,
          kind: kindSel.value,
          number: number,
          size: sizeInput.value.trim(),
          printName: printInput.value.trim() || null,
          holderMemberId: null,
          holderName: null,
          paid: null,
          note: noteInput.value.trim() || null
        };
        if (modeSel.value === 'member') {
          if (!memberSel.value) { UI().toast('持ち主のメンバーを選んでください。'); return; }
          u.holderMemberId = memberSel.value;
          u.paid = paidSel.value === 'true';
        } else if (modeSel.value === 'external') {
          if (!nameInput.value.trim()) { UI().toast('持ち主の名前を入力してください。'); return; }
          u.holderName = nameInput.value.trim();
          u.paid = paidSel.value === 'true';
        }
        saveBtn.disabled = true;
        try {
          await Api().adminSaveUniform(u);
          UI().toast(isNew ? '追加しました。' : '保存しました。');
          state.kind = u.kind;
          paintSeg();
          resetAdd();
          reload();
        } catch (ex) {
          UI().toast('保存に失敗しました。' + UI().friendlyError(ex));
          saveBtn.disabled = false;
        }
      });
      return form;
    }

    function resetAdd() {
      addWrap.innerHTML = '';
      var b = addBtn(addWrap, '＋ ユニフォームを追加', 'btn-navy', function () {
        addWrap.innerHTML = '';
        addWrap.appendChild(buildForm(null));
      });
      b.className = 'btn btn-navy';
    }

    // --- 貸出フォーム ---
    function buildLendForm(row, panel) {
      var form = el('form', 'form');
      var modeSel = selectOf([['member', 'メンバー'], ['external', 'アプリ外の人']], 'member');
      fieldRow(form, '借り手の種類', modeSel);
      var memberSel = selectOf(memberOptions(), '');
      var memberRow = fieldRow(form, '借り手（メンバー）', memberSel);
      var nameInput = inputOf('text', '');
      var nameRow = fieldRow(form, '借り手（名前）', nameInput);
      var noteInput = inputOf('text', '');
      fieldRow(form, 'メモ', noteInput);
      function paint() {
        memberRow.style.display = modeSel.value === 'member' ? '' : 'none';
        nameRow.style.display = modeSel.value === 'external' ? '' : 'none';
      }
      modeSel.addEventListener('change', paint);
      paint();
      var submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn btn-navy btn-small';
      submit.textContent = '貸し出す';
      form.appendChild(submit);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var borrower = { memberId: null, name: null, note: noteInput.value.trim() || null };
        if (modeSel.value === 'member') {
          if (!memberSel.value) { UI().toast('借り手のメンバーを選んでください。'); return; }
          borrower.memberId = memberSel.value;
        } else {
          if (!nameInput.value.trim()) { UI().toast('借り手の名前を入力してください。'); return; }
          borrower.name = nameInput.value.trim();
        }
        submit.disabled = true;
        try {
          await Api().adminLendUniform(row.id, borrower);
          UI().toast('貸出を登録しました。');
          reload();
        } catch (ex) {
          UI().toast('貸出に失敗しました。' + UI().friendlyError(ex));
          submit.disabled = false;
        }
      });
      return form;
    }

    // --- 一覧 ---
    function renderRow(row) {
      var card = el('div', 'practice-card');
      card.style.marginBottom = '12px';

      var head = el('p');
      head.style.margin = '0 0 4px';
      var title = 'No.' + row.number + '　' + row.size + 'サイズ';
      if (row.kind === 'second' && row.print_name) { title += '　プリント: ' + row.print_name; }
      head.appendChild(el('strong', null, title));
      if (row.loan_id) {
        head.appendChild(document.createTextNode('　'));
        head.appendChild(el('span', 'badge badge-yellow', '貸出中'));
      }
      card.appendChild(head);

      var meta = '持ち主: ' + Pure().uniformHolderLabel(row)
        + '　／　支払い: ' + Pure().uniformPaidLabel(row);
      card.appendChild(el('p', 'muted', meta));
      if (row.loan_id) {
        card.appendChild(el('p', 'muted',
          '貸出先: ' + (row.borrower_name || '—')
          + '（' + UI().fmtDateJST(row.lent_on) + '〜）'));
      }
      if (row.note) { card.appendChild(el('p', 'muted', 'メモ: ' + row.note)); }

      var panel = document.createElement('div');
      var actions = document.createElement('div');
      actions.className = 'practice-actions';
      addBtn(actions, '編集', 'btn-ghost', function () {
        panel.innerHTML = '';
        panel.appendChild(buildForm(row));
      });
      if (Pure().uniformHasHolder(row)) {
        addBtn(actions, row.paid ? '未払いに戻す' : '支払い済にする', 'btn-ghost', async function () {
          try {
            await Api().adminSetUniformPaid(row.id, !row.paid);
            UI().toast(row.paid ? '未払いに戻しました。' : '支払い済にしました。');
            reload();
          } catch (e) {
            UI().toast('変更に失敗しました。' + UI().friendlyError(e));
          }
        });
      }
      if (row.loan_id) {
        addBtn(actions, '返却', 'btn-navy', async function () {
          try {
            await Api().adminReturnUniform(row.id);
            UI().toast('返却を登録しました。');
            reload();
          } catch (e) {
            UI().toast('返却に失敗しました。' + UI().friendlyError(e));
          }
        });
      } else {
        addBtn(actions, '貸出', 'btn-navy', function () {
          panel.innerHTML = '';
          panel.appendChild(buildLendForm(row, panel));
        });
      }
      card.appendChild(actions);
      card.appendChild(panel);
      return card;
    }

    function paintList() {
      listWrap.innerHTML = '';
      var rows = state.rows.filter(function (r) { return r.kind === state.kind; });
      if (rows.length === 0) {
        listWrap.appendChild(el('p', 'muted', 'この種類のユニフォームはまだ登録されていません。'));
        return;
      }
      rows.forEach(function (row) { listWrap.appendChild(renderRow(row)); });
    }

    async function reload() {
      try {
        var rows = await Api().adminListUniforms();
        state.rows = Array.isArray(rows) ? rows : [];
        paintSummary();
        paintList();
      } catch (e) {
        listWrap.innerHTML = '';
        listWrap.appendChild(el('p', 'danger-text',
          'ユニフォームを取得できませんでした。' + UI().friendlyError(e)));
      }
    }

    listWrap.appendChild(el('p', 'muted', '読み込み中…'));
    // メンバー選択肢 (現役のみ、id 付き名簿) を先に用意してから一覧を描く。
    Api().adminMemberOptions().then(function (rows) {
      state.members = Array.isArray(rows) ? rows : [];
    }).catch(function () {
      state.members = [];
    }).then(reload);
  }

  window.VstarsAdminUniforms = { renderAdminUniforms: renderAdminUniforms };
})();

