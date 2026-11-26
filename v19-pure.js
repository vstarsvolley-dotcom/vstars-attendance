/* Vstars 出欠 — v19 純粋関数
 * チーム分け・お知らせバリデーション・リマインド対象抽出・出席率の期間計算。
 * DOM や Supabase に依存しない純粋関数だけを置く (node でテストできる)。
 * UMD 形式: ブラウザでは window.V19Pure、node では module.exports。
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
  if (root) { root.V19Pure = api; }
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

  // チャットメッセージのバリデーション (最大 1000 字、SQL 29 と一致)。
  function validateChatMessage(text) {
    var t = (text === null || text === undefined) ? '' : String(text).trim();
    if (t.length === 0) { return { ok: false, error: 'empty_message' }; }
    if (t.length > 1000) { return { ok: false, error: 'message_too_long' }; }
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

  // 出席率タブの期間切替 (純粋関数)。
  // period: 'all' | 'last3months' | 'thismonth'
  // todayStr: 'YYYY-MM-DD' (JST の今日)。
  // 戻り値は {from, to} (日付文字列 or null)。ローカルタイムゾーンに
  // 依存しないよう todayStr を Y/M/D の整数に分解し Date.UTC で計算する。
  // 'all' → {from: null, to: null}。
  // 'last3months' → from は今日から 3 カ月前の同日 (月末にクランプ。
  //   例: 2026-11-30 → 2026-08-30、2026-05-31 → 2026-02-28)、to は今日。
  // 'thismonth' → from は当月 1 日、to は今日。
  // 不正な period は Error('invalid_period') を投げる。
  function statsPeriodRange(period, todayStr) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function key(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
    if (period === 'all') { return { from: null, to: null }; }
    var parts = String(todayStr || '').split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) { throw new Error('invalid_period'); }
    if (period === 'last3months') {
      // 3 カ月前の年月を求め、その月の末日で日をクランプする。
      var total = y * 12 + (m - 1) - 3;
      var py = Math.floor(total / 12);
      var pm = total - py * 12 + 1;
      var lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      var pd = d > lastDay ? lastDay : d;
      return { from: key(py, pm, pd), to: key(y, m, d) };
    }
    if (period === 'thismonth') {
      return { from: key(y, m, 1), to: key(y, m, d) };
    }
    throw new Error('invalid_period');
  }

  // 監査ログ (SQL 26) のアクション名 → 日本語ラベル。
  // 未知のアクションはそのまま返す (新しい監査対象が増えても落とさない)。
  var AUDIT_ACTION_LABELS = {
    add_walkin: '当日参加を追加',
    apply_practice: '練習に申込',
    approve_request: '登録申請を承認',
    bootstrap_owner: 'オーナーを初期化',
    cancel_invitation: '招待を取り消し',
    cancel_practice: '練習を中止',
    cancel_registration: '申込をキャンセル',
    change_capacity: '定員を変更',
    confirm_withdrawal: '退会を確定',
    correct_attendance: '出欠を修正',
    create_member: 'メンバーを作成',
    create_notice: 'お知らせを投稿',
    create_practice: '練習を作成',
    delete_announcement: 'お知らせを削除',
    delete_practice_message: 'チャットメッセージを削除',
    delete_notice: '全体お知らせを削除',
    delete_member: 'メンバーを削除',
    demote_registration: 'キャンセル待ちに戻した',
    finalize_attendance: '出欠を確定',
    generate_practices: '練習を一括生成',
    grant_admin: '管理者権限を付与',
    invite_member: 'メンバーを招待',
    link_admin_auth: '管理者認証を連携',
    mail_mark_result: 'メール送信の結果を記録',
    mark_regular: '常連に設定',
    promote_waitlist: '繰り上がり',
    proxy_apply: '代理で申込',
    proxy_cancel_registration: '代理で申込をキャンセル',
    purge_rejected_request: '却下した申請を削除',
    purge_withdrawn_member: '退会メンバーを完全削除',
    purge_withdrawn_members: '退会メンバーを一括完全削除',
    reject_request: '登録申請を却下',
    reset_pin: 'PINをリセット',
    respond_invitation: '招待に回答',
    restore_practice: '練習を復旧',
    retry_mail: 'メールを再送',
    revoke_admin: '管理者権限を剥奪',
    revoke_devices: 'デバイスを無効化',
    save_teams: 'チーム分けを保存',
    save_uniform: 'ユニフォームを保存',
    delete_uniform: 'ユニフォームを削除',
    set_uniform_paid: 'ユニフォーム支払いを変更',
    lend_uniform: 'ユニフォームを貸出',
    return_uniform: 'ユニフォームを返却',
    send_announcement: 'お知らせを送信',
    set_attendance: '出欠を入力',
    set_initial_pin: '初期PINを設定',
    set_pin_name_failed: 'PIN設定の本人確認に失敗',
    set_skill_level: 'レベルを設定',
    set_uniform_purchased: 'ユニフォーム購入を変更',
    update_member: 'メンバー情報を編集',
    update_practice: '練習を編集',
    verify_pin_failed: 'PINログインに失敗'
  };

  function auditActionLabel(action) {
    if (!action) { return '—'; }
    return AUDIT_ACTION_LABELS[action] || String(action);
  }

  // 監査ログの detail (jsonb) を1行テキストにする。
  // 値が 'changed' の項目はキーだけを出す (変更された項目名の一覧として読む)。
  // 空・null は '' を返す。
  function auditDetailText(detail) {
    if (!detail || typeof detail !== 'object') { return ''; }
    var keys = Object.keys(detail);
    if (keys.length === 0) { return ''; }
    return keys.map(function (k) {
      var v = detail[k];
      if (v === 'changed') { return k; }
      if (v === null || v === undefined) { return k + ': —'; }
      if (typeof v === 'object') { return k + ': ' + JSON.stringify(v); }
      return k + ': ' + String(v);
    }).join('、');
  }

  // 練習行の人数フィールドを名前の揺れを吸収して読む。
  // DB (list_practices 等) は waitlisted_count を返すが、表示側が
  // waitlist_count を読んでいたため待ち人数が常に 0 になっていた
  // (2026-11-22 修正)。snake_case / camelCase の両対応で読む。
  function practiceCounts(p) {
    p = p || {};
    function pick(names) {
      for (var i = 0; i < names.length; i++) {
        var v = p[names[i]];
        if (v !== undefined && v !== null) {
          var n = Number(v);
          return isNaN(n) ? 0 : n;
        }
      }
      return 0;
    }
    return {
      confirmed: pick(['confirmed_count', 'confirmedCount']),
      waitlist: pick(['waitlist_count', 'waitlisted_count', 'waitlistCount', 'waitlistedCount']),
      men: pick(['confirmed_men', 'confirmedMen']),
      women: pick(['confirmed_women', 'confirmedWomen']),
      other: pick(['confirmed_other', 'confirmedOther'])
    };
  }

  // 招待ピッカーの絞り込み (SQL 27)。
  // members: admin_list_members の行。opts: {query, uniformOnly}。
  // query は LINE名・本名・特徴メモ (admin_note) への部分一致 (大小無視)。
  // 退会済みは常に除外する。
  function filterInviteCandidates(members, opts) {
    opts = opts || {};
    var q = String(opts.query || '').trim().toLowerCase();
    var uniformOnly = !!opts.uniformOnly;
    return (Array.isArray(members) ? members : []).filter(function (m) {
      if (!m || m.status === 'withdrawn' || m.is_withdrawn) { return false; }
      if (uniformOnly && !m.uniform_purchased) { return false; }
      if (q) {
        var hay = [m.line_name, m.real_name, m.admin_note]
          .map(function (v) { return String(v || '').toLowerCase(); }).join('\n');
        if (hay.indexOf(q) === -1) { return false; }
      }
      return true;
    });
  }

  // ユニフォーム管理 (SQL 36) の表示ラベル (純粋関数)。
  // u は admin_list_uniforms の行 (snake_case) を想定する。
  // 持ち主: メンバー → LINE名（No.）、外部 → holder_name、両方なし → '在庫'。
  function uniformHolderLabel(u) {
    if (!u) { return '在庫'; }
    if (u.holder_member_id) {
      var name = u.holder_line_name || u.holder_name || 'メンバー';
      if (u.holder_member_no !== null && u.holder_member_no !== undefined) {
        return name + '（No.' + u.holder_member_no + '）';
      }
      return name;
    }
    if (u.holder_name) { return String(u.holder_name); }
    return '在庫';
  }

  function uniformHasHolder(u) {
    return !!(u && (u.holder_member_id || u.holder_name));
  }

  // 支払いラベル: 持ち主なしは '―' (対象外)、ありは 済/未。
  function uniformPaidLabel(u) {
    if (!uniformHasHolder(u)) { return '―'; }
    return u.paid ? '支払い済' : '未払い';
  }

  // 未払い件数を種類別に数える。持ち主がいて paid !== true の行だけが対象。
  function uniformUnpaidCounts(rows) {
    var counts = { first: 0, second: 0, total: 0 };
    (Array.isArray(rows) ? rows : []).forEach(function (u) {
      if (!uniformHasHolder(u) || u.paid) { return; }
      if (u.kind === 'first') { counts.first += 1; }
      else if (u.kind === 'second') { counts.second += 1; }
      else { return; }
      counts.total += 1;
    });
    return counts;
  }

  return {
    splitTeams: splitTeams,
    validateAnnouncementMessage: validateAnnouncementMessage,
    validateChatMessage: validateChatMessage,
    filterReminderTargets: filterReminderTargets,
    statsPeriodRange: statsPeriodRange,
    practiceCounts: practiceCounts,
    filterInviteCandidates: filterInviteCandidates,
    uniformHolderLabel: uniformHolderLabel,
    uniformHasHolder: uniformHasHolder,
    uniformPaidLabel: uniformPaidLabel,
    uniformUnpaidCounts: uniformUnpaidCounts,
    auditActionLabel: auditActionLabel,
    auditDetailText: auditDetailText,
    AUDIT_ACTION_LABELS: AUDIT_ACTION_LABELS
  };
});
