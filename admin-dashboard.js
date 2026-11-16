/* Vstars 出欠 — 管理ダッシュボード
* 未通知の繰り上がり/待ち戻し (admin_list_unnotified) を最上部に表示し、
* LINE 送信用の文面コピーと「通知済みにする」を備える。
* 直近の練習まとめ (確定数/定員・男女別・待ち数)、承認待ちの登録申請、
* メール送信状況、ログアウト。
*/
'use strict';

(function () {
function viewEl() { return document.getElementById('view');}
function Api() { return window.VstarsApi;}
function UI() { return window.VstarsUI;}
function App() { return window.VstarsAdminApp;}

function renderDashboard() {
var view = App().adminHeader(viewEl(), 'dashboard', '管理ダッシュボード');
var wrap = document.createElement('div');
view.appendChild(wrap);
loadDashboard(wrap);

var logoutBtn = document.createElement('button');
logoutBtn.type = 'button';
logoutBtn.className = 'btn btn-ghost';
logoutBtn.style.marginTop = '24px';
logoutBtn.textContent = '管理者ログアウト';
logoutBtn.addEventListener('click', function () { App().signOut();});
view.appendChild(logoutBtn);
}

function lineMessage(row) {
var date = UI().fmtDateTimeJST(row.practice_date || row.date, row.start_time, row.end_time);
var kind = row.kind === 'demotion'? '待ちに戻りました': '繰り上がりで確定となりました';
var name = (row.line_name || '') + ' さん (No.' + (row.member_no!== undefined? row.member_no: '-') + ')';
return '出欠変更のお知らせ\n' + name + '\n' + date + ' ' + (row.venue || '')
+ ' の練習で、' + kind + '。ご確認ください。';
}

async function copyText(text) {
try {
await window.navigator.clipboard.writeText(text);
return true;
} catch (e) {
try {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
document.body.appendChild(ta);
ta.focus();
ta.select();
var ok = document.execCommand('copy');
ta.remove();
return ok;
} catch (e2) { return false;}
}
}

function section(title) {
var s = document.createElement('section');
s.className = 'practice-card';
s.style.marginBottom = '16px';
var h = document.createElement('h2');
h.className = 'section-title';
h.style.marginTop = '0';
h.textContent = title;
s.appendChild(h);
return s;
}

async function loadDashboard(wrap) {
wrap.innerHTML = '';

// --- 未通知一覧 ---
var unSec = section('未通知の繰り上がり・待ち戻し');
var unBody = document.createElement('div');
unBody.innerHTML = '<p>読み込み中…</p>';
unSec.appendChild(unBody);
wrap.appendChild(unSec);
try {
var unnotified = await Api().adminListUnnotified();
var rows = Array.isArray(unnotified)? unnotified: [];
unBody.innerHTML = '';
if (rows.length === 0) {
unBody.innerHTML = '<p>未通知はありません。</p>';
} else {
var badge = document.createElement('p');
badge.innerHTML = '<span class="badge badge-yellow">' + rows.length + '件の未通知があります</span>';
unBody.appendChild(badge);
rows.forEach(function (row) {
var item = document.createElement('div');
item.className = 'my-reg-item';
item.style.marginBottom = '8px';
var t = document.createElement('p');
t.style.margin = '0 0 8px';
t.textContent = UI().fmtDateTimeJST(row.practice_date || row.date, row.start_time, row.end_time)
+ ' ' + (row.venue || '') + ' — ' + (row.line_name || '') + ' (No.' + (row.member_no!== undefined? row.member_no: '-') + ') '
+ (row.kind === 'demotion'? '待ち戻し': '繰り上がり');
item.appendChild(t);
var btns = document.createElement('div');
btns.className = 'practice-actions';
var copyBtn = document.createElement('button');
copyBtn.type = 'button';
copyBtn.className = 'btn btn-ghost btn-small';
copyBtn.textContent = 'LINE文面をコピー';
copyBtn.addEventListener('click', async function () {
var ok = await copyText(lineMessage(row));
UI().toast(ok? 'LINE用の文面をコピーしました。': 'コピーに失敗しました。');
});
var doneBtn = document.createElement('button');
doneBtn.type = 'button';
doneBtn.className = 'btn btn-navy btn-small';
doneBtn.textContent = '通知済みにする';
doneBtn.addEventListener('click', async function () {
try {
await Api().adminMarkNotified(row.registration_id || row.id, row.kind || 'promotion');
UI().toast('通知済みにしました。');
loadDashboard(wrap);
} catch (e) {
UI().toast('通知済みにできませんでした。' + (e && e.message? ' ' + e.message: ''));
}
});
btns.appendChild(copyBtn);
btns.appendChild(doneBtn);
item.appendChild(btns);
unBody.appendChild(item);
});
}
} catch (e) {
unBody.innerHTML = '<p class="danger-text">未通知一覧を取得できませんでした。' + UI().esc(e && e.message? e.message: '') + '</p>';
}

// --- 直近の練習まとめ ---
var prSec = section('直近の練習');
var prBody = document.createElement('div');
prBody.innerHTML = '<p>読み込み中…</p>';
prSec.appendChild(prBody);
wrap.appendChild(prSec);
try {
var practices = await Api().adminListPractices();
var list = Array.isArray(practices)? practices: [];
// 「今日」は JST の日付文字列で比較する。new Date() のローカル日付だと
// 端末が日本国外のときに前日/翌日ずれて今日の練習が消える。
var todayJst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
var upcoming = list
.filter(function (p) { return!p.is_cancelled && (!p.practice_date || String(p.practice_date).slice(0, 10) >= todayJst);})
.sort(function (a, b) { return String(a.practice_date).localeCompare(String(b.practice_date));})
.slice(0, 5);
prBody.innerHTML = '';
if (upcoming.length === 0) {
prBody.innerHTML = '<p>今後の練習はありません。</p>';
} else {
for (var i = 0; i < upcoming.length; i++) {
var p = upcoming[i];
var pid = p.practice_id || p.id;
var counts = { male: 0, female: 0, other: 0, prefer_not_to_say: 0};
var confirmed = p.confirmed_count!== undefined? p.confirmed_count: null;
var waitlisted = p.waitlist_count!== undefined? p.waitlist_count: 0;
try {
var gc = await Api().adminPracticeGenderCounts(pid);
var g = Array.isArray(gc)? gc[0]: gc;
if (g) {
counts.male = g.male || 0;
counts.female = g.female || 0;
counts.other = g.other || 0;
counts.prefer_not_to_say = g.prefer_not_to_say || 0;
if (confirmed === null) { confirmed = counts.male + counts.female + counts.other + counts.prefer_not_to_say;}
}
} catch (e) { /* 集計が取れなくても行は表示する */}
var line = document.createElement('p');
line.style.margin = '0 0 8px';
var kindPrefix = (p.kind === 'match' || p.kind === 'tournament') ? '［' + UI().kindLabel(p.kind) + '］' : '';
line.textContent = kindPrefix + UI().fmtDateTimeJST(p.practice_date, p.start_time, p.end_time) + ' ' + (p.venue || '')
+ ' — 確定 ' + (confirmed === null? '—': confirmed) + '/' + (p.capacity!== undefined? p.capacity: 18)
+ '（男 ' + counts.male + '・女 ' + counts.female + '・その他 ' + (counts.other + counts.prefer_not_to_say) + '）'
+ (waitlisted > 0? ' 待ち ' + waitlisted + '名': '');
prBody.appendChild(line);
}
var link = document.createElement('a');
link.href = '#/admin/practices';
link.textContent = '練習管理へ →';
prBody.appendChild(link);
}
} catch (e) {
prBody.innerHTML = '<p class="danger-text">練習一覧を取得できませんでした。' + UI().esc(e && e.message? e.message: '') + '</p>';
}

// --- 承認待ちの登録申請 ---
var rqSec = section('承認待ちの登録申請');
var rqBody = document.createElement('div');
rqBody.innerHTML = '<p>読み込み中…</p>';
rqSec.appendChild(rqBody);
wrap.appendChild(rqSec);
try {
var reqs = await Api().adminListRegistrationRequests();
var pending = (Array.isArray(reqs)? reqs: [])
.filter(function (r) { return!r.status || r.status === 'pending';});
rqBody.innerHTML = '';
if (pending.length === 0) {
rqBody.innerHTML = '<p>承認待ちの申請はありません。</p>';
} else {
var rp = document.createElement('p');
rp.textContent = pending.length + '件の承認待ちがあります。';
rqBody.appendChild(rp);
var rlink = document.createElement('a');
rlink.href = '#/admin/requests';
rlink.textContent = '登録申請を見る →';
rqBody.appendChild(rlink);
}
} catch (e) {
rqBody.innerHTML = '<p class="danger-text">登録申請を取得できませんでした。' + UI().esc(e && e.message? e.message: '') + '</p>';
}

// --- メール送信状況 ---
var mailSec = section('メール送信状況');
var mailBody = document.createElement('div');
mailBody.innerHTML = '<p>読み込み中…</p>';
mailSec.appendChild(mailBody);
wrap.appendChild(mailSec);
try {
var st = await Api().adminMailStatus();
var s = Array.isArray(st)? st[0]: st;
mailBody.innerHTML = '';
var mp = document.createElement('p');
mp.textContent = s
? ('本日の送信数: ' + (s.sent_today!== undefined? s.sent_today: (s.today_sent!== undefined? s.today_sent: '—'))
+ ' / 上限 100件' + (s.last_sent_at? '　最終送信: ' + s.last_sent_at: ''))
: 'メール状況を取得できませんでした。';
mailBody.appendChild(mp);
} catch (e) {
mailBody.innerHTML = '<p class="danger-text">メール状況を取得できませんでした。' + UI().esc(e && e.message? e.message: '') + '</p>';
}
}

window.VstarsAdminDashboard = { renderDashboard: renderDashboard, lineMessage: lineMessage};
})();
