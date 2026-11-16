/* Vstars 出欠 — 管理者ログイン (Supabase Auth メール/パスワード)
 * PIN ではなく Supabase Auth を使う。セッションは Supabase が管理する。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }

  function renderAdminLogin() {
    var view = viewEl();
    if (!view) { return; }
    // 招待・パスワード再設定リンクから来た場合 (#access_token&...&type=recovery/invite):
    // ログイン画面ではなく新しいパスワードの設定画面を出す。
    var hash = window.location.hash || '';
    if (hash.indexOf('type=recovery') !== -1 || hash.indexOf('type=invite') !== -1) {
      renderSetPassword(view);
      return;
    }
    view.innerHTML = '';

    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = '管理者ログイン';
    view.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'view-lead';
    lead.textContent = '管理者はメールアドレスとパスワードでログインします。メンバー用 PIN とは別です。';
    view.appendChild(lead);

    var form = document.createElement('form');
    form.className = 'form';

    function field(labelText, type, id, autoComplete) {
      var div = document.createElement('div');
      div.className = 'field';
      var label = document.createElement('label');
      label.textContent = labelText;
      label.setAttribute('for', id);
      div.appendChild(label);
      var input = document.createElement('input');
      input.type = type;
      input.id = id;
      input.autocomplete = autoComplete;
      input.required = true;
      div.appendChild(input);
      form.appendChild(div);
      return input;
    }

    var emailInput = field('メールアドレス', 'email', 'admin-email', 'username');
    var pwInput = field('パスワード', 'password', 'admin-password', 'current-password');

    var msg = document.createElement('p');
    msg.className = 'field-error';
    msg.hidden = true;
    form.appendChild(msg);

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy btn-large';
    submit.textContent = '管理者としてログイン';
    form.appendChild(submit);

    var back = document.createElement('a');
    back.className = 'btn btn-ghost';
    back.href = '#/practices';
    back.textContent = 'メンバー画面に戻る';
    form.appendChild(back);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.hidden = true;
      submit.disabled = true;
      submit.textContent = '確認中…';
      try {
        await Api().signInAdmin(emailInput.value.trim(), pwInput.value);
        UI().toast('管理者としてログインしました。');
        window.location.hash = '#/admin';
        window.VstarsAdminApp.renderAdmin('#/admin');
      } catch (err) {
        msg.textContent = 'ログインできませんでした。メールアドレスとパスワードを確認してください。'
          + (err && err.message ? '（' + err.message + '）' : '');
        msg.hidden = false;
        submit.disabled = false;
        submit.textContent = '管理者としてログイン';
        pwInput.value = '';
        pwInput.focus();
      }
    });

    view.appendChild(form);
    emailInput.focus();
  }

  // 新しいパスワードの設定画面 (招待・再設定リンク用)。
  function renderSetPassword(view) {
    view.innerHTML = '';
    var title = document.createElement('h1');
    title.className = 'view-title';
    title.textContent = 'パスワードを設定する';
    view.appendChild(title);
    var lead = document.createElement('p');
    lead.className = 'view-lead';
    lead.textContent = '管理者アカウントの新しいパスワードを決めてください。8文字以上で入力してください。';
    view.appendChild(lead);
    var form = document.createElement('form');
    form.className = 'form';
    function field(labelText, id, autoComplete) {
      var div = document.createElement('div');
      div.className = 'field';
      var label = document.createElement('label');
      label.textContent = labelText;
      label.setAttribute('for', id);
      div.appendChild(label);
      var input = document.createElement('input');
      input.type = 'password';
      input.id = id;
      input.autocomplete = autoComplete;
      input.required = true;
      input.minLength = 8;
      div.appendChild(input);
      form.appendChild(div);
      return input;
    }
    var pw1 = field('新しいパスワード', 'new-password', 'new-password');
    var pw2 = field('新しいパスワード（確認）', 'new-password-confirm', 'new-password');
    var msg = document.createElement('p');
    msg.className = 'field-error';
    msg.hidden = true;
    form.appendChild(msg);
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-navy btn-large';
    submit.textContent = 'パスワードを設定する';
    form.appendChild(submit);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.hidden = true;
      if (pw1.value !== pw2.value) {
        msg.textContent = '2つのパスワードが一致しません。もう一度入力してください。';
        msg.hidden = false;
        return;
      }
      if (pw1.value.length < 8) {
        msg.textContent = 'パスワードは8文字以上にしてください。';
        msg.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.textContent = '設定中…';
      try {
        await Api().updateAdminPassword(pw1.value);
        UI().toast('パスワードを設定しました。');
        window.location.hash = '#/admin';
        window.VstarsAdminApp.renderAdmin('#/admin');
      } catch (err) {
        msg.textContent = '設定できませんでした。リンクの有効期限が切れている可能性があります。'
          + (err && err.message ? '（' + err.message + '）' : '');
        msg.hidden = false;
        submit.disabled = false;
        submit.textContent = 'パスワードを設定する';
      }
    });
    view.appendChild(form);
    pw1.focus();
  }

  window.VstarsAdminAuth = { renderAdminLogin: renderAdminLogin };
})();
