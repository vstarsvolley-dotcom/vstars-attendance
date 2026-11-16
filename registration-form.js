/* Vstars — 新規登録フォーム (#/register)
* member-app.js から window.VstarsRegistrationForm.renderRegistrationForm() が呼ばれる。
* 通常モード: submit_registration_request を呼ぶ。
* 代理モード (#/register?agent=1):
* API キー入力欄 (password) を表示し、submit_registration_request_by_agent を呼ぶ。
* API キーは現在のページセッション中の JS 変数にのみ保持する
* (localStorage や URL には絶対に保存しない)。
* consent_at は DB 側で記録するため、クライアントは日時を送らない。
*/
'use strict';

(function () {
function viewEl() { return document.getElementById('view');}
function Api() { return window.VstarsApi;}
function UI() { return window.VstarsUI;}

function isAgentMode() {
var h = window.location.hash || '';
return h.indexOf('agent=1')!== -1;
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

function inputOf(type, value, required, placeholder) {
var i = document.createElement('input');
i.type = type;
if (value!== undefined && value!== null) { i.value = value;}
if (required) { i.required = true;}
if (placeholder) { i.placeholder = placeholder;}
return i;
}

function renderRegistrationForm() {
var view = viewEl();
if (!view) { return;}
view.innerHTML = '';
var agentMode = isAgentMode();
// API キーはこのクロージャ変数にのみ保持する (保存・URL 埋め込みなし)
var agentApiKey = '';

var title = document.createElement('h1');
title.className = 'view-title';
title.textContent = 'Vstars 新規登録';
view.appendChild(title);

if (agentMode) {
var agentNote = document.createElement('p');
agentNote.className = 'muted';
agentNote.textContent = '代理登録モードです。管理者が本人に代わって登録します。';
view.appendChild(agentNote);
}

var form = document.createElement('form');
form.className = 'form';
form.noValidate = true;

var realI = fieldRow(form, '本名 (必須)', inputOf('text', '', true, '例: 星 直樹'));
realI.maxLength = 100;
realI.autocomplete = 'name';
var lineI = fieldRow(form, 'LINE名 (必須)', inputOf('text', '', true, 'LINE で表示される名前'));
lineI.maxLength = 100;
var genderSel = document.createElement('select');
genderSel.required = true;
[['', '選択してください'], ['male', '男'], ['female', '女'], ['other', 'その他'], ['prefer_not_to_say', '回答しない']].forEach(function (kv) {
var o = document.createElement('option');
o.value = kv[0];
o.textContent = kv[1];
genderSel.appendChild(o);
});
fieldRow(form, '性別 (必須)', genderSel);
var birthI = fieldRow(form, '生年月日 (任意)', inputOf('date', '', false));
var ageI = fieldRow(form, '年齢 (任意・生年月日が無い場合)', inputOf('number', '', false, '例: 28'));
ageI.min = '0';
ageI.max = '120';
var expI = fieldRow(form, 'バレー歴 (任意)', inputOf('text', '', false, '例: 高校3年・大学サークル2年'));
expI.maxLength = 500;
var posSel = document.createElement('select');
[['', '選択してください'], ['setter', 'セッター'], ['outside', 'レフト'], ['middle', 'センター'], ['opposite', 'ライト'], ['libero', 'リベロ'], ['undecided', '未定']].forEach(function (kv) {
var o = document.createElement('option');
o.value = kv[0];
o.textContent = kv[1];
posSel.appendChild(o);
});
fieldRow(form, 'ポジション (任意)', posSel);

var apiKeyI = null;
if (agentMode) {
apiKeyI = fieldRow(form, '代理登録 API キー (必須)', inputOf('password', '', true, '管理者から共有されたキー'));
apiKeyI.autocomplete = 'off';
}

var consentLabel = document.createElement('label');
var consentChk = document.createElement('input');
consentChk.type = 'checkbox';
consentChk.required = true;
consentLabel.appendChild(consentChk);
consentLabel.appendChild(document.createTextNode(' 個人情報の取り扱いに同意します (必須)'));
form.appendChild(consentLabel);

var privacy = document.createElement('p');
privacy.className = 'muted';
privacy.textContent = '入力いただいた本名・LINE名・性別・生年月日・年齢・バレー歴・ポジションは、Vstars の出欠管理と連絡のためにのみ使用します。管理者以外には本名と生年月日は表示されません。退会が確定したメンバーのデータは 1 年後に削除されます。同意いただけない場合は登録できません。';
form.appendChild(privacy);

var errEl = document.createElement('p');
errEl.className = 'field-error';
errEl.hidden = true;
form.appendChild(errEl);

var submit = document.createElement('button');
submit.type = 'submit';
submit.className = 'btn btn-navy btn-large';
submit.textContent = '登録を申請する';
form.appendChild(submit);

form.addEventListener('submit', async function (e) {
e.preventDefault();
errEl.hidden = true;
errEl.textContent = '';
var realName = realI.value.trim();
var lineName = lineI.value.trim();
var gender = genderSel.value;
var birthDate = birthI.value || null;
var ageVal = ageI.value === '' ? null : parseInt(ageI.value, 10);
if (ageVal !== null && (isNaN(ageVal) || ageVal < 0 || ageVal > 120)) {
errEl.textContent = '年齢は 0〜120 の数字で入力してください。';
errEl.hidden = false;
return;
}
if (!realName ||!lineName ||!gender) {
errEl.textContent = '本名・LINE名・性別は必須です。';
errEl.hidden = false;
return;
}
if (!consentChk.checked) {
errEl.textContent = '個人情報の取り扱いへの同意が必要です。';
errEl.hidden = false;
return;
}
submit.disabled = true;
submit.textContent = '送信中…';
try {
var req = { realName: realName, lineName: lineName, gender: gender, birthDate: birthDate, consent: true, age: ageVal, volleyballExperience: expI.value.trim() || null, position: posSel.value || null };
if (agentMode) {
// API キーはこのページセッション中の変数にのみ保持する
agentApiKey = apiKeyI.value;
if (!agentApiKey) { throw new Error('代理登録 API キーを入力してください。');}
await Api().submitRegistrationRequestByAgent(agentApiKey, req);
} else {
await Api().submitRegistrationRequest(req);
}
// 成功画面: 承認待ちであること、承認までメンバー一覧に出ないことを明示する
view.innerHTML = '';
var h = document.createElement('h1');
h.className = 'view-title';
h.textContent = '承認待ちです';
view.appendChild(h);
var p1 = document.createElement('p');
p1.textContent = '登録申請を受け付けました。管理者が承認するまでお待ちください。';
view.appendChild(p1);
var p2 = document.createElement('p');
p2.textContent = '承認されるまでメンバー一覧には表示されず、練習への申込はできません。承認されると LINE名でログインできるようになります。';
view.appendChild(p2);
var back = document.createElement('a');
back.className = 'btn btn-ghost';
back.href = '#/practices';
back.textContent = 'トップに戻る';
view.appendChild(back);
UI().toast('登録申請を送信しました。');
} catch (ex) {
errEl.textContent = '送信に失敗しました。' + (ex && ex.message? ' ' + ex.message: '');
errEl.hidden = false;
} finally {
submit.disabled = false;
submit.textContent = '登録を申請する';
}
});

view.appendChild(form);
realI.focus();
}

window.VstarsRegistrationForm = { renderRegistrationForm: renderRegistrationForm, isAgentMode: isAgentMode};
// 旧名のエイリアス (互換用)
window.VstarsRegistration = { render: renderRegistrationForm, isAgentMode: isAgentMode};
})();
