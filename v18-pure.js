/* Vstars 出欠 — v18 純粋関数
 * チーム分け・お知らせバリデーション・リマインド対象抽出。
 * DOM や Supabase に依存しない純粋関数だけを置く (node でテストできる)。
 * UMD 形式: ブラウザでは window.V18Pure、node では module.exports。
 * チーム分けの方針 (REQUIREMENTS-22.md 第 3 節):
 * - レベルをスコア化 (S=5, A=4, B=3, C=2, D=1, 未設定=2) し、
 *   スコア降順 (同点は会員番号昇順) でスネークドラフトする。
 * - 人数は均等配分 (人数差は最大 1)。第 3 引数 sizes でチームごとの
 *   人数を直接指定できる (合計が参加者数と一致しない場合はエラー)。
 * - セッターは各チームに 1 人ずつ入るよう、ドラフト後に交換で調整する。
 *   セッターがチーム数より少ない場合はいる分だけ振り分け、
 *   余ったセッターはレベル順のドラフトで振り分ける。
 * - 他のポジションは考慮しない。男女比の均等化はしない。
 * - 決定的であること (Math.random を使わない)。
 */
'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.V18Pure = api; }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this), function () {

  var SCORE = { S: 5, A: 4, B: 3, C: 2, D: 1 };

  function skillScore(member) {
    if (!member) { return 2; }
    var lv = member.skillLevel !== undefined ? member.skillLevel : member.skill_level;
    if (lv === null || lv === undefined || lv === '') { return 2; }
    var s = SCORE[String(lv).toUpperCase()];
    return s === undefined ? 2 : s;
  }

  function memberNoOf(member) {
    if (!member) { return 0; }
    var n = member.memberNo !== undefined ? member.memberNo : member.member_no;
    var v = parseInt(n, 10);
    return isNaN(v) ? 0 : v;
  }

  function isSetter(member) {
    if (!member) { return false; }
    var pos = member.position !== undefined ? member.position : member.volleyball_position;
    if (!pos) { return false; }
    if (Array.isArray(pos)) { return pos.indexOf('setter') !== -1; }
    return pos === 'setter';
  }

  // スネークドラフトの順序 (0 起点のチーム index)。
  // 1→2→3→3→2→1→1→2→3→… を繰り返す。周期は 2 * teamCount。
  function snakeTeamAt(pickIndex, teamCount) {
    if (teamCount <= 1) { return 0; }
    var period = 2 * teamCount;
    var c = pickIndex % period;
    return c < teamCount ? c : period - 1 - c;
  }

  function countSetters(teamMembers) {
    var n = 0;
    teamMembers.forEach(function (m) { if (isSetter(m)) { n += 1; } });
    return n;
  }

  // セッター調整: セッターが 0 人のチームと 2 人以上のチームがある場合、
  // スコア差が最小の相手 (セッター⇔非セッター) と交換する。
  // 交換は 1 対 1 のためチーム人数は変わらない。
  // セッターがチーム数より少なく、2 人以上いるチームがない場合は
  // 調整できない (セッターがいないチームがあってもよい) ため終了する。
  function adjustSetters(teams) {
    var guard = 0;
    for (;;) {
      guard += 1;
      if (guard > 100) { return; }
      var zeroIdx = -1;
      var i;
      for (i = 0; i < teams.length; i++) {
        if (countSetters(teams[i].members) === 0) { zeroIdx = i; break; }
      }
      if (zeroIdx === -1) { return; }
      var donorIdx = -1;
      var donorCount = 1;
      for (i = 0; i < teams.length; i++) {
        var c = countSetters(teams[i].members);
        if (c > donorCount) { donorCount = c; donorIdx = i; }
      }
      if (donorIdx === -1) { return; }
      var donor = teams[donorIdx].members;
      var zero = teams[zeroIdx].members;
      var bestSetter = null;
      var bestOther = null;
      var bestDiff = Infinity;
      donor.forEach(function (s) {
        if (!isSetter(s)) { return; }
        zero.forEach(function (z) {
          if (isSetter(z)) { return; }
          var diff = Math.abs(skillScore(s) - skillScore(z));
          var better = false;
          if (diff < bestDiff) { better = true; }
          else if (diff === bestDiff && bestSetter) {
            if (memberNoOf(s) < memberNoOf(bestSetter)) { better = true; }
            else if (memberNoOf(s) === memberNoOf(bestSetter) && memberNoOf(z) < memberNoOf(bestOther)) { better = true; }
          }
          if (better) {
            bestDiff = diff;
            bestSetter = s;
            bestOther = z;
          }
        });
      });
      if (!bestSetter || !bestOther) { return; }
      var si = donor.indexOf(bestSetter);
      var zi = zero.indexOf(bestOther);
      donor[si] = bestOther;
      zero[zi] = bestSetter;
    }
  }

  // members: [{memberNo, lineName, gender, skillLevel, position}]
  //   (skillLevel は 'S'/'A'/'B'/'C'/'D'/null、position は文字列または配列)
  // teamCount: チーム数 (2 または 3。1 も可)
  // sizes: チームごとの人数指定 (例: [5,5,6])。省略時は均等配分。
  // 戻り値: [{teamNo, members:[...]}] (teamNo は 1〜teamCount、
  //   members は元のオブジェクトそのまま)
  function splitTeams(members, teamCount, sizes) {
    var list = Array.isArray(members) ? members.slice() : [];
    var n = list.length;
    var tc = parseInt(teamCount, 10);
    if (isNaN(tc) || tc < 1) { tc = 1; }

    var caps;
    if (sizes !== undefined && sizes !== null) {
      if (!Array.isArray(sizes) || sizes.length !== tc) {
        throw new Error('チームごとの人数指定はチーム数と一致させてください。');
      }
      var sum = 0;
      var i;
      for (i = 0; i < sizes.length; i++) {
        var v = sizes[i];
        if (typeof v !== 'number' || v % 1 !== 0 || v < 0) {
          throw new Error('チームごとの人数は0以上の整数で指定してください。');
        }
        sum += v;
      }
      if (sum !== n) {
        throw new Error('人数の合計が参加者数と一致しません。');
      }
      caps = sizes.slice();
    } else {
      // 均等配分: 人数をチーム数で割り、余りを先頭のチームから配る
      // (各チームの人数差は最大 1)。
      var base = Math.floor(n / tc);
      var rem = n % tc;
      caps = [];
      for (i = 0; i < tc; i++) {
        caps.push(base + (i < rem ? 1 : 0));
      }
    }

    // スコア降順、同点は会員番号昇順 (最後に元の並び順で安定化)。
    var indexed = list.map(function (m, idx) { return { m: m, idx: idx }; });
    indexed.sort(function (a, b) {
      var d = skillScore(b.m) - skillScore(a.m);
      if (d !== 0) { return d; }
      var nd = memberNoOf(a.m) - memberNoOf(b.m);
      if (nd !== 0) { return nd; }
      return a.idx - b.idx;
    });
    var sorted = indexed.map(function (x) { return x.m; });

    var teams = [];
    var t;
    for (t = 0; t < tc; t++) {
      teams.push({ teamNo: t + 1, members: [] });
    }
    // スネークドラフト。満員のチームはスキップし、次の順番のチームに入れる。
    var pick = 0;
    sorted.forEach(function (m) {
      var guard = 0;
      var teamIdx = snakeTeamAt(pick, tc);
      while (teams[teamIdx].members.length >= caps[teamIdx]) {
        pick += 1;
        guard += 1;
        if (guard > 10000) { throw new Error('チーム分けに失敗しました。'); }
        teamIdx = snakeTeamAt(pick, tc);
      }
      teams[teamIdx].members.push(m);
      pick += 1;
    });

    adjustSetters(teams);
    return teams;
  }

  // お知らせメッセージのバリデーション (最大 500 字)。
  // 空文字 (前後空白のみ含む) → empty_message、501 字以上 → message_too_long。
  function validateAnnouncementMessage(text) {
    var t = (text === null || text === undefined) ? '' : String(text).trim();
    if (t.length === 0) { return { ok: false, error: 'empty_message' }; }
    if (t.length > 500) { return { ok: false, error: 'message_too_long' }; }
    return { ok: true, length: t.length };
  }

  // 前日リマインドの対象抽出 (純粋関数)。
  // practices: [{id, practiceDate, status}]
  // registrations: [{practiceId, memberId, status}]
  // tomorrow: 'YYYY-MM-DD'
  // 翌日かつ status='scheduled' の練習の、status='confirmed' の
  // memberId だけを返す。対象者がいない練習は含めない。
  function filterReminderTargets(practices, registrations, tomorrow) {
    var pracs = Array.isArray(practices) ? practices : [];
    var regs = Array.isArray(registrations) ? registrations : [];
    var out = [];
    pracs.forEach(function (pr) {
      var id = pr.id !== undefined ? pr.id : pr.practice_id;
      var date = pr.practiceDate !== undefined ? pr.practiceDate : pr.practice_date;
      if (String(date || '').slice(0, 10) !== tomorrow) { return; }
      if (pr.status !== 'scheduled') { return; }
      var memberIds = [];
      regs.forEach(function (r) {
        var pid = r.practiceId !== undefined ? r.practiceId : r.practice_id;
        var mid = r.memberId !== undefined ? r.memberId : r.member_id;
        if (String(pid) !== String(id)) { return; }
        if (r.status !== 'confirmed') { return; }
        if (memberIds.indexOf(mid) === -1) { memberIds.push(mid); }
      });
      if (memberIds.length === 0) { return; }
      out.push({ practiceId: id, memberIds: memberIds });
    });
    return out;
  }

  return {
    splitTeams: splitTeams,
    validateAnnouncementMessage: validateAnnouncementMessage,
    filterReminderTargets: filterReminderTargets
  };
});
