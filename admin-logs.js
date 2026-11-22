/* Vstars 出欠 — 管理: 監査ログ閲覧 (SQL 26)
 * audit_logs を新しい順に表示する。期間・実行者区分・操作・会員番号で
 * 絞り込める。表示はすべて textContent で行い、ログ内の文字列を
 * HTML として解釈しない。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }
  function Pure() { return window.V19Pure; }

  var PAGE = 100;

  var ROLE_LABELS = {
    admin: '管理者',
    owner: 'オーナー',
    member: 'メンバー',
    system: 'システム',
    agent: '自動処理',
    anonymous: '未ログイン'
  };

  function roleLabel(role) {
    if (!role) { return 'システム'; }
    return ROLE_LABELS[role] || String(role);
  }

  function personText(role, lineName, memberNo) {
    var s = roleLabel(role);
    if (lineName) {
      s += ' ' + lineName;
      if (memberNo !== null && memberNo !== undefined) { s += '（No.' + memberNo + '）'; }
    }
    return s;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function fieldRow(form, labelText, input) {
    var wrap = el('div', 'field');
    var label = el('label', null, labelText);
    wrap.appendChild(label);
    wrap.appendChild(input);
    form.appendChild(wrap);
    return input;
  }

  function renderAdminLogs() {
    var view = App().adminHeader(viewEl(), 'logs', 'ログ');
    view.appendChild(el('p', 'muted',
      '管理者とメンバーの操作記録です。新しい順に表示します。'));

    var form = el('form', 'form');

    var daysSel = document.createElement('select');
    [['30', '直近30日'], ['1', '今日'], ['7', '直近7日'], ['', 'すべて']].forEach(function (d) {
      var o = document.createElement('option');
      o.value = d[0];
      o.textContent = d[1];
      daysSel.appendChild(o);
    });
    fieldRow(form, '期間', daysSel);

    var roleSel = document.createElement('select');
    [['', 'すべて'], ['admin', '管理者'], ['owner', 'オーナー'], ['member', 'メンバー'], ['system', 'システム']]
      .forEach(function (d) {
        var o = document.createElement('option');
        o.value = d[0];
        o.textContent = d[1];
        roleSel.appendChild(o);
      });
    fieldRow(form, '実行者', roleSel);

    var actionSel = document.createElement('select');
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'すべて';
    actionSel.appendChild(allOpt);
    var labels = Pure().AUDIT_ACTION_LABELS || {};
    Object.keys(labels).sort(function (a, b) {
      return labels[a] < labels[b] ? -1 : (labels[a] > labels[b] ? 1 : 0);
    }).forEach(function (key) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = labels[key];
      actionSel.appendChild(o);
    });
    fieldRow(form, '操作', actionSel);

    var noInput = document.createElement('input');
    noInput.type = 'number';
    noInput.min = '1';
    noInput.placeholder = '例: 26';
    fieldRow(form, '会員番号（実行者または対象者）', noInput);

    var submit = el('button', 'btn btn-navy', '表示する');
    submit.type = 'submit';
    form.appendChild(submit);
    view.appendChild(form);

    var listWrap = el('div');
    view.appendChild(listWrap);
    var moreBtn = el('button', 'btn btn-ghost', 'もっと見る');
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    view.appendChild(moreBtn);

    var offset = 0;
    var loading = false;

    function currentOpts() {
      var no = parseInt(noInput.value, 10);
      return {
        limit: PAGE,
        offset: offset,
        action: actionSel.value || null,
        actorRole: roleSel.value || null,
        memberNo: isNaN(no) ? null : no,
        days: daysSel.value === '' ? null : parseInt(daysSel.value, 10)
      };
    }

    function renderRow(row) {
      var card = el('div', 'practice-card');
      var head = el('p');
      var strong = el('strong', null, Pure().auditActionLabel(row.action));
      head.appendChild(strong);
      head.appendChild(document.createTextNode('　'));
      head.appendChild(el('span', 'muted', UI().fmtDateTimeJST(row.occurred_at)));
      card.appendChild(head);

      var meta = personText(row.actor_role, row.actor_line_name, row.actor_member_no);
      if (row.subject_line_name) {
        meta += '　／　対象: ' + row.subject_line_name
          + (row.subject_member_no !== null && row.subject_member_no !== undefined
            ? '（No.' + row.subject_member_no + '）' : '');
      }
      card.appendChild(el('p', 'muted', meta));

      var detail = Pure().auditDetailText(row.detail);
      if (detail) { card.appendChild(el('p', 'muted', detail)); }
      return card;
    }

    async function load(append) {
      if (loading) { return; }
      loading = true;
      if (!append) {
        offset = 0;
        listWrap.innerHTML = '';
        listWrap.appendChild(el('p', 'muted', '読み込み中…'));
      }
      moreBtn.hidden = true;
      try {
        var rows = await Api().adminListAuditLogs(currentOpts());
        if (!append) { listWrap.innerHTML = ''; }
        if (!rows || rows.length === 0) {
          if (!append) { listWrap.appendChild(el('p', 'muted', '該当するログがありません。')); }
        } else {
          rows.forEach(function (row) { listWrap.appendChild(renderRow(row)); });
          offset += rows.length;
          moreBtn.hidden = rows.length < PAGE;
        }
      } catch (e) {
        if (!append) {
          listWrap.innerHTML = '';
          listWrap.appendChild(el('p', 'danger-text',
            'ログを取得できませんでした。' + UI().friendlyError(e)));
        } else {
          UI().toast('続きを取得できませんでした。');
        }
      } finally {
        loading = false;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      load(false);
    });
    moreBtn.addEventListener('click', function () { load(true); });

    load(false);
  }

  window.VstarsAdminLogs = { renderAdminLogs: renderAdminLogs };
})();
