/* Vstars 出欠 — 管理: 出席率 (SQL 22)
 * admin_member_stats を呼び、出席率順に表示する。
 * 会員名 (LINE 名・本名) での検索ができる。
 * 出席率が NULL (未入力のみ) の会員は「—」と表示する。
 * レベルは管理者画面のみの表示 (会員側には出さない)。
 */
'use strict';

(function () {
  function viewEl() { return document.getElementById('view'); }
  function Api() { return window.VstarsApi; }
  function UI() { return window.VstarsUI; }
  function App() { return window.VstarsAdminApp; }

  var lastStats = [];
  var lastRealNames = {};

  function rateText(rate) {
    if (rate === null || rate === undefined || rate === '') { return '—'; }
    var v = parseFloat(rate);
    if (isNaN(v)) { return '—'; }
    if (v <= 1) { return Math.round(v * 100) + '%'; }
    return String(v) + '%';
  }

  function levelText(level) {
    return level || '未設定';
  }

  async function renderAdminAttendance() {
    var view = App().adminHeader(viewEl(), 'attendance', '出席率');
    var lead = document.createElement('p');
    lead.className = 'muted';
    lead.textContent = '出席率の高い順に並んでいます。出席率は「出席 ÷ (出席＋欠席)」で、未入力は数えません。';
    view.appendChild(lead);

    var searchForm = document.createElement('form');
    searchForm.className = 'form';
    var q = document.createElement('input');
    q.type = 'search';
    q.placeholder = 'LINE名または本名で検索';
    var qWrap = document.createElement('div');
    qWrap.className = 'field';
    var qLabel = document.createElement('label');
    qLabel.textContent = '会員検索';
    qWrap.appendChild(qLabel);
    qWrap.appendChild(q);
    searchForm.appendChild(qWrap);
    var searchBtn = document.createElement('button');
    searchBtn.type = 'submit';
    searchBtn.className = 'btn btn-navy';
    searchBtn.textContent = '検索';
    searchForm.appendChild(searchBtn);
    view.appendChild(searchForm);

    var listEl = document.createElement('div');
    view.appendChild(listEl);

    function drawList() {
      var query = (q.value || '').trim();
      var shown = lastStats.filter(function (r) {
        if (!query) { return true; }
        var line = r.line_name || '';
        var real = lastRealNames[r.member_no] || '';
        return line.indexOf(query) !== -1 || real.indexOf(query) !== -1;
      });
      listEl.innerHTML = '';
      if (shown.length === 0) {
        UI().showEmpty(listEl, query ? '該当するメンバーはいません。' : '出席率のデータがありません。');
        return;
      }
      var table = document.createElement('div');
      table.className = 'table-wrap';
      var html = '<table class="data"><thead><tr><th>No.</th><th>LINE名</th><th>レベル</th>'
        + '<th>申込数</th><th>確定数</th><th>出席数</th><th>欠席数</th><th>キャンセル数</th><th>出席率</th></tr></thead><tbody>';
      shown.forEach(function (r) {
        html += '<tr><td>' + UI().esc(r.member_no !== undefined ? r.member_no : '-') + '</td>'
          + '<td>' + UI().esc(r.line_name || '-') + '</td>'
          + '<td>' + UI().esc(levelText(r.skill_level)) + '</td>'
          + '<td>' + UI().esc(r.applied_count !== undefined ? r.applied_count : 0) + '</td>'
          + '<td>' + UI().esc(r.confirmed_count !== undefined ? r.confirmed_count : 0) + '</td>'
          + '<td>' + UI().esc(r.attended_count !== undefined ? r.attended_count : 0) + '</td>'
          + '<td>' + UI().esc(r.absent_count !== undefined ? r.absent_count : 0) + '</td>'
          + '<td>' + UI().esc(r.cancelled_count !== undefined ? r.cancelled_count : 0) + '</td>'
          + '<td>' + UI().esc(rateText(r.attendance_rate)) + '</td></tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
      listEl.appendChild(table);
    }

    async function refresh() {
      listEl.innerHTML = '<p>読み込み中…</p>';
      try {
        var rows = await Api().adminMemberStats();
        lastStats = Array.isArray(rows) ? rows : [];
      } catch (e) {
        UI().showError(listEl, '出席率を取得できませんでした。' + (e && e.message ? ' ' + e.message : ''), refresh);
        return;
      }
      // 本名での検索のため、会員一覧から本名を補う (取得できなければ LINE 名のみで検索)。
      try {
        var members = await Api().adminListMembers('');
        lastRealNames = {};
        (Array.isArray(members) ? members : []).forEach(function (m) {
          lastRealNames[m.member_no] = m.real_name || '';
        });
      } catch (e) { lastRealNames = {}; }
      drawList();
    }

    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      drawList();
    });
    q.addEventListener('input', function () { drawList(); });
    refresh();
  }

  window.VstarsAdminAttendance = { renderAdminAttendance: renderAdminAttendance };
})();
