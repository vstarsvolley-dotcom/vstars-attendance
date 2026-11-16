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

  window.VstarsAdminAuth = { renderAdminLogin: renderAdminLogin };
})();
