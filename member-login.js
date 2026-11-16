/* Vstars 出欠 — ログイン画面
 * LINE 名ピッカー (list_member_names: LINE 名と会員番号のみ) → PIN 入力。
 * PIN 未設定の場合は初回設定モード (PIN + 確認用 PIN、各4桁)。
 * ロック時はサーバーのメッセージをそのまま表示する。
 */
'use strict';

(function () {
  var selectedMember = null; // { line_name, member_no }
  var pinMode = 'verify'; // 'verify' | 'set'
  var namesCache = [];

  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function isLockedError(e) {
    var msg = (e && e.message) || '';
    return /ロック|locked|lock/i.test(msg);
  }

  function renderLogin() {
    var view = viewEl();
    if (!view) { return; }
    UI().showLoading(view, 'メンバー一覧を読み込み中…');
    selectedMember = null;
    pinMode = 'verify';
    Api().listMemberNames().then(function (rows) {
      namesCache = Array.isArray(rows) ? rows : [];
      drawPicker(view, '');
    }).catch(function (e) {
      UI().showError(view, 'メンバー一覧を読み込めませんでした。' + (e && e.message ? ' ' + e.message : ''), renderLogin);
    });
  }

  function drawPicker(view, filter) {
    view.innerHTML = '';
    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = 'ログイン';
    view.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'view-lead';
    lead.textContent = '自分の LINE 名を選んで、4桁の PIN を入力してください。';
    view.appendChild(lead);

    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'name-search';
    search.placeholder = 'LINE 名で検索';
    search.setAttribute('aria-label', 'LINE 名で検索');
    search.value = filter || '';
    search.addEventListener('input', function () { drawList(listEl, search.value); });
    view.appendChild(search);

    var listEl = document.createElement('ul');
    listEl.className = 'name-list';
    view.appendChild(listEl);
    drawList(listEl, filter || '');

    var reg = document.createElement('p');
    reg.className = 'muted';
    var regLink = document.createElement('a');
    regLink.href = '#/register';
    regLink.textContent = 'まだ登録していない方はこちら（新規登録申請）';
    reg.appendChild(regLink);
    view.appendChild(reg);

    var adminLink = document.createElement('p');
    adminLink.className = 'muted';
    var a = document.createElement('a');
    a.href = '#/admin';
    a.textContent = '管理者の方はこちら';
    adminLink.appendChild(a);
    view.appendChild(adminLink);

    search.focus();
  }

  function drawList(listEl, filter) {
    listEl.innerHTML = '';
    var q = (filter || '').trim().toLowerCase();
    var rows = namesCache.filter(function (r) {
      var name = String(r.line_name || r.lineName || '');
      return !q || name.toLowerCase().indexOf(q) !== -1;
    });
    if (rows.length === 0) {
      var li = document.createElement('li');
      li.className = 'muted';
      li.textContent = '該当する名前がありません。';
      listEl.appendChild(li);
      return;
    }
    rows.forEach(function (r) {
      var name = r.line_name || r.lineName || '';
      var no = r.member_no !== undefined ? r.member_no : r.memberNo;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.setAttribute('aria-pressed', selectedMember && selectedMember.member_no === no ? 'true' : 'false');
      btn.addEventListener('click', function () {
        selectedMember = { line_name: name, member_no: no };
        drawPinStep();
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function drawPinStep() {
    var view = viewEl();
    if (!view || !selectedMember) { return; }
    view.innerHTML = '';

    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = pinMode === 'set' ? 'PIN を設定する' : 'PIN を入力';
    view.appendChild(title);

    var who = document.createElement('p');
    who.className = 'view-lead';
    who.textContent = 'LINE 名: ' + selectedMember.line_name;
    view.appendChild(who);

    var form = document.createElement('form');
    form.className = 'form';
    form.setAttribute('autocomplete', 'off');

    function pinField(labelText, name, autoComplete) {
      var div = document.createElement('div');
      div.className = 'field';
      var label = document.createElement('label');
      label.textContent = labelText;
      label.setAttribute('for', 'pin-' + name);
      div.appendChild(label);
      var input = document.createElement('input');
      input.type = 'password';
      input.id = 'pin-' + name;
      input.name = name;
      input.inputMode = 'numeric';
      input.setAttribute('pattern', '[0-9]{4}');
      input.maxLength = 4;
      input.autocomplete = autoComplete || 'off';
      input.required = true;
      input.placeholder = '••••';
      input.addEventListener('input', function () {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
      });
      div.appendChild(input);
      var err = document.createElement('p');
      err.className = 'field-error';
      err.hidden = true;
      div.appendChild(err);
      form.appendChild(div);
      return { input: input, err: err };
    }

    var pin1 = pinField(pinMode === 'set' ? '新しい PIN（4桁の数字）' : 'PIN（4桁の数字）', 'pin1', 'current-password');
    var pin2 = null;
    if (pinMode === 'set') {
      pin2 = pinField('PIN の確認（もう一度入力）', 'pin2', 'new-password');
    }

    var msg = document.createElement('p');
    msg.className = 'field-error';
    msg.hidden = true;
    form.appendChild(msg);

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy btn-large';
    submit.textContent = pinMode === 'set' ? 'PIN を設定してログイン' : 'ログイン';
    form.appendChild(submit);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-ghost';
    toggle.textContent = pinMode === 'set' ? 'PIN を設定済みの方はこちら' : 'はじめての方はこちら（PIN を設定する）';
    toggle.addEventListener('click', function () {
      pinMode = pinMode === 'set' ? 'verify' : 'set';
      drawPinStep();
    });
    form.appendChild(toggle);

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn-ghost';
    back.textContent = '名前を選び直す';
    back.addEventListener('click', function () { renderLogin(); });
    form.appendChild(back);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.hidden = true;
      pin1.err.hidden = true;
      if (pin2) { pin2.err.hidden = true; }
      var pin = pin1.input.value;
      if (!/^[0-9]{4}$/.test(pin)) {
        pin1.err.textContent = 'PIN は4桁の数字で入力してください。';
        pin1.err.hidden = false;
        pin1.input.focus();
        return;
      }
      if (pinMode === 'set') {
        if (pin !== pin2.input.value) {
          pin2.err.textContent = '確認用の PIN が一致しません。';
          pin2.err.hidden = false;
          pin2.input.focus();
          return;
        }
      }
      submit.disabled = true;
      submit.textContent = '確認中…';
      try {
        if (pinMode === 'set') {
          await Api().setInitialPin(selectedMember.member_no, pin);
        } else {
          await Api().verifyPin(selectedMember.member_no, pin);
        }
        var token = Api().ensureDeviceToken();
        Api().setSession(token, selectedMember.member_no);
        window.VstarsMemberApp.setHeaderUser(selectedMember.line_name);
        UI().toast('ログインしました。');
        window.location.hash = '#/practices';
      } catch (err) {
        if (isLockedError(err)) {
          msg.textContent = err.message + ' しばらく待ってからもう一度お試しください。';
        } else if (pinMode === 'verify') {
          msg.textContent = 'PIN が正しくありません。もう一度入力してください。';
        } else {
          msg.textContent = 'PIN を設定できませんでした。' + (err && err.message ? ' ' + err.message : '');
        }
        msg.hidden = false;
        submit.disabled = false;
        submit.textContent = pinMode === 'set' ? 'PIN を設定してログイン' : 'ログイン';
        pin1.input.value = '';
        if (pin2) { pin2.input.value = ''; }
        pin1.input.focus();
      }
    });

    view.appendChild(form);
    pin1.input.focus();
  }

  window.VstarsMemberLogin = { renderLogin: renderLogin };
})();
