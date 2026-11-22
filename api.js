/* Vstars 出欠 — API 層
 * Supabase クライアントを1つ作り、CONTRACT.md の RPC を1関数ずつラップする。
 * すべての呼び出しは supabase.rpc(name, args) (POST)。
 * service_role キーはどこにも使わない。anon key のみ。
 * トークン: localStorage 'vstars_device_token'
 * 会員番号: localStorage 'vstars_member_no'
 */
'use strict';

(function () {
  var TOKEN_KEY = 'vstars_device_token';
  var MEMBER_NO_KEY = 'vstars_member_no';
  var config = window.VSTARS_CONFIG || {};
  var client = null;
  var configError = '';

  // 招待・パスワード再設定リンクの判定はここで同期的に行う。
  // Supabase クライアントは初期化時に URL の access_token を消費して
  // hash を消してしまうため、後から見ると type=recovery が分からなくなる。
  try {
    var _h = window.location.hash || '';
    if (_h.indexOf('type=recovery') !== -1 || _h.indexOf('type=invite') !== -1) {
      window.sessionStorage.setItem('vstars_set_password', '1');
    }
  } catch (e) {}

  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    configError = 'Supabase の設定が未入力です。config.js に SUPABASE_URL と SUPABASE_ANON_KEY を入力してください。';
  } else if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    configError = 'Supabase ライブラリを読み込めませんでした。ネットワーク接続を確認してください。';
  } else {
    try {
      client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    } catch (e) {
      configError = 'Supabase クライアントの作成に失敗しました: ' + (e && e.message ? e.message : e);
    }
  }

  function getClient() {
    if (!client) { throw new Error(configError || 'Supabase に接続できません。'); }
    return client;
  }

  function rpcErrorMessage(err) {
    if (!err) { return '通信に失敗しました。'; }
    return err.message || err.error_description || err.hint || '通信に失敗しました。';
  }

  // RPC を呼び、成功時は data を、失敗時は Error を throw して返す。
  async function callRpc(name, args) {
    var sb = getClient();
    var res = await sb.rpc(name, args || {});
    if (res.error) {
      var err = new Error(rpcErrorMessage(res.error));
      err.code = res.error.code;
      err.rpc = name;
      throw err;
    }
    return res.data;
  }

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function getMemberNo() {
    try {
      var v = window.localStorage.getItem(MEMBER_NO_KEY);
      if (v === null || v === undefined || v === '') { return null; }
      var n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    } catch (e) { return null; }
  }

  function setSession(token, memberNo) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(MEMBER_NO_KEY, String(memberNo));
    } catch (e) { /* プライベートモード等では保存できない場合がある */ }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(MEMBER_NO_KEY);
    } catch (e) { /* ignore */ }
  }

  // crypto.getRandomValues で 32 バイトのランダム値を base64url 化する。
  function generateDeviceToken() {
    var bytes = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) { bytes[i] = Math.floor(Math.random() * 256); }
    }
    var bin = '';
    for (var j = 0; j < bytes.length; j++) { bin += String.fromCharCode(bytes[j]); }
    return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deviceLabel() {
    var ua = (window.navigator && window.navigator.userAgent) || '';
    if (/iPhone|iPad|iPod/.test(ua)) { return 'iPhone/iPad'; }
    if (/Android/.test(ua)) { return 'Android'; }
    if (/Windows/.test(ua)) { return 'Windows'; }
    if (/Macintosh/.test(ua)) { return 'Mac'; }
    return 'ブラウザ';
  }

  var api = {
    // --- 状態 ---
    isConfigured: function () { return !!client; },
    configError: function () { return configError; },
    getClient: getClient,
    // --- トークン ---
    getToken: getToken,
    getMemberNo: getMemberNo,
    setSession: setSession,
    clearSession: clearSession,
    generateDeviceToken: generateDeviceToken,
    deviceLabel: deviceLabel,
    ensureDeviceToken: function () {
      var t = getToken();
      if (!t) { t = generateDeviceToken(); try { window.localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
      return t;
    },

    // --- メンバー用 RPC ---
    listMemberNames: function () { return callRpc('list_member_names', {}); },
    setInitialPin: function (memberNo, pin, realName) {
      return callRpc('set_initial_pin', {
        p_member_no: memberNo, p_pin: pin,
        p_device_token: api.ensureDeviceToken(), p_device_label: deviceLabel(),
        p_real_name: realName || null
      }).then(function (res) {
        // 本名チェックの失敗は verifyPin と同じく ok:false で返る (SQL 14)。
        // そのまま返すとログイン成功扱いになるため、ここで throw する。
        if (res && res.ok === false) {
          var code = res.error || 'real_name_mismatch';
          var e = new Error(code);
          e.code = code;
          throw e;
        }
        return res;
      });
    },
    // ログアウト: サーバー側で当該デバイス行を取り消してから (C13)、
    // ローカルのセッションを消す。サーバー呼び出しが失敗しても
    // ローカルセッションは必ず消す (閉じ込め防止)。
    logout: function () {
      var token = getToken();
      var done = function () { clearSession(); };
      if (!token) { done(); return Promise.resolve({ ok: true }); }
      return callRpc('member_logout', { p_token: token }).then(done, done);
    },
    verifyPin: function (memberNo, pin) {
      return callRpc('verify_pin', {
        p_member_no: memberNo, p_pin: pin,
        p_device_token: api.ensureDeviceToken(), p_device_label: deviceLabel()
      }).then(function (res) {
        // 失敗は例外ではなく ok:false で返る (SQL 側のコメント参照)。
        // ロック到達時は device_locked 扱いにして、ログイン画面の
        // ロック文言 (isLockedError) が出るようにする。
        // pin_rate_limited はそのままのコードで返す。
        if (res && res.ok === false) {
          var code = res.error || 'invalid_pin';
          if (res.locked_until) { code = 'device_locked'; }
          var e = new Error(code);
          e.code = code;
          e.failedAttempts = res.failed_attempts;
          e.lockedUntil = res.locked_until;
          throw e;
        }
        return res;
      });
    },
    listPractices: function () { return callRpc('list_practices', { p_token: getToken() }); },
    // 過去の練習 (SQL 21): 自分に申込行がある過去の練習だけを返す。
    listPastPractices: function () { return callRpc('list_past_practices', { p_token: getToken() }); },
    listPracticesForMonth: function (year, month) {
      return callRpc('list_practices_for_month', { p_token: getToken(), p_year: year, p_month: month });
    },
    applyPractice: function (practiceId) {
      return callRpc('apply_practice', { p_token: getToken(), p_practice_id: practiceId });
    },
    applyBulk: function (practiceIds) {
      return callRpc('apply_bulk', { p_token: getToken(), p_practice_ids: practiceIds });
    },
    cancelRegistration: function (registrationId) {
      return callRpc('cancel_registration', { p_token: getToken(), p_registration_id: registrationId });
    },
    listMyNotices: function () { return callRpc('list_my_notices', { p_token: getToken() }); },
    ackStatusChange: function (registrationId) {
      return callRpc('ack_status_change', { p_token: getToken(), p_registration_id: registrationId });
    },
    getMyPage: function () { return callRpc('get_my_page', { p_token: getToken() }); },
    savePushSubscription: function (endpoint, p256dh, auth) {
      return callRpc('member_save_push_subscription', {
        p_token: getToken(), p_endpoint: endpoint, p_p256dh: p256dh,
        p_auth: auth, p_user_agent: deviceLabel()
      });
    },
    deletePushSubscription: function (endpoint) {
      return callRpc('member_delete_push_subscription', { p_token: getToken(), p_endpoint: endpoint });
    },
    getPracticeRoster: function (practiceId) {
      return callRpc('get_practice_roster', { p_token: getToken(), p_practice_id: practiceId });
    },
    // 運営からのお知らせ (SQL 22): 申込済みの練習のお知らせを新しい順に返す (最大 5 件)。
    listMyAnnouncements: function (practiceId) {
      return callRpc('list_my_announcements', { p_token: getToken(), p_practice_id: practiceId });
    },
    // 自分のチーム (SQL 22): 未割当は 0 行。team_label は 'Aチーム' 等。
    getMyTeam: function (practiceId) {
      return callRpc('get_my_team', { p_token: getToken(), p_practice_id: practiceId });
    },
    // 非公開イベントへの招待 (SQL 19)。承認待ち・保留中の招待を返す。
    listMyInvitations: function () {
      return callRpc('list_my_invitations', { p_token: getToken() });
    },
    // 招待への回答。response は 'accepted' / 'declined' / 'held'。
    respondInvitation: function (invitationId, response) {
      return callRpc('respond_invitation', {
        p_token: getToken(), p_invitation_id: invitationId, p_response: response
      });
    },
    submitRegistrationRequest: function (req) {
      return callRpc('submit_registration_request', {
        p_real_name: req.realName, p_line_name: req.lineName, p_gender: req.gender,
        p_birth_date: req.birthDate, p_consent: !!req.consent,
        p_age: req.age !== undefined ? req.age : null,
        p_volleyball_experience: req.volleyballExperience || null,
        p_position: req.position || null
      });
    },
    submitRegistrationRequestByAgent: function (apiKey, req) {
      return callRpc('submit_registration_request_by_agent', {
        p_api_key: apiKey, p_real_name: req.realName, p_line_name: req.lineName,
        p_gender: req.gender, p_birth_date: req.birthDate, p_consent: !!req.consent,
        p_age: req.age !== undefined ? req.age : null,
        p_volleyball_experience: req.volleyballExperience || null,
        p_position: req.position || null
      });
    },

    // --- 管理者用 RPC (Supabase Auth のログインが前提) ---
    adminListPractices: function () {
      return callRpc('admin_list_practices', {}).then(function (rows) {
        // admin_list_practices は status ('scheduled'/'cancelled') を返すが、
        // 画面側は is_cancelled を見るためここで正規化する (E2-10)。
        (Array.isArray(rows) ? rows : []).forEach(function (p) {
          p.is_cancelled = p.status === 'cancelled';
        });
        return rows;
      });
    },
    adminCreatePractice: function (p) {
      return callRpc('admin_create_practice', {
        p_practice_date: p.date, p_start_time: p.startTime, p_end_time: p.endTime,
        p_venue: p.venue, p_capacity: p.capacity, p_rule_id: p.ruleId || null,
        p_kind: p.kind || 'practice',
        p_capacity_men: p.capacityMen !== undefined ? p.capacityMen : null,
        p_capacity_women: p.capacityWomen !== undefined ? p.capacityWomen : null,
        p_visibility: p.visibility !== undefined ? p.visibility : null,
        p_video_url: p.videoUrl || null
      });
    },
    adminUpdatePractice: function (practiceId, p) {
      return callRpc('admin_update_practice', {
        p_practice_id: practiceId, p_practice_date: p.date, p_start_time: p.startTime,
        p_end_time: p.endTime, p_venue: p.venue, p_capacity: p.capacity,
        p_kind: p.kind || null,
        p_capacity_men: p.capacityMen !== undefined ? p.capacityMen : null,
        p_capacity_women: p.capacityWomen !== undefined ? p.capacityWomen : null,
        p_visibility: p.visibility !== undefined ? p.visibility : null,
        p_video_url: p.videoUrl !== undefined ? p.videoUrl : null
      });
    },
    adminCancelPractice: function (practiceId, reason) {
      return callRpc('admin_cancel_practice', { p_practice_id: practiceId, p_reason: reason || '' });
    },
    adminRestorePractice: function (practiceId) {
      return callRpc('admin_restore_practice', { p_practice_id: practiceId });
    },
    adminChangeCapacity: function (practiceId, capacity, capacityMen, capacityWomen) {
      return callRpc('admin_change_capacity', {
        p_practice_id: practiceId, p_capacity: capacity,
        p_capacity_men: capacityMen !== undefined ? capacityMen : null,
        p_capacity_women: capacityWomen !== undefined ? capacityWomen : null
      });
    },
    adminGetPracticeRoster: function (practiceId) {
      return callRpc('admin_get_practice_roster', { p_practice_id: practiceId });
    },
    adminPracticeGenderCounts: function (practiceId) {
      return callRpc('admin_practice_gender_counts', { p_practice_id: practiceId });
    },
    // 非公開イベントへの招待の管理 (SQL 19)。
    adminInviteMember: function (practiceId, memberNo) {
      return callRpc('admin_invite_member', { p_practice_id: practiceId, p_member_no: memberNo });
    },
    adminCancelInvitation: function (practiceId, memberNo) {
      return callRpc('admin_cancel_invitation', { p_practice_id: practiceId, p_member_no: memberNo });
    },
    adminListInvitations: function (practiceId) {
      return callRpc('admin_list_invitations', { p_practice_id: practiceId });
    },
    adminProxyApply: function (practiceId, memberNo, reason) {
      return callRpc('admin_proxy_apply', {
        p_practice_id: practiceId, p_member_no: memberNo, p_reason: reason || ''
      });
    },
    adminProxyCancel: function (registrationId, reason) {
      return callRpc('admin_proxy_cancel', { p_registration_id: registrationId, p_reason: reason || '' });
    },
    adminAddWalkin: function (practiceId, memberNo) {
      return callRpc('admin_add_walkin', { p_practice_id: practiceId, p_member_no: memberNo });
    },
    adminFinalizeAttendance: function (practiceId) {
      return callRpc('admin_finalize_attendance', { p_practice_id: practiceId });
    },
    adminCorrectAttendance: function (practiceId, memberNo, result, reason) {
      return callRpc('admin_correct_attendance', {
        p_practice_id: practiceId, p_member_no: memberNo, p_result: result, p_reason: reason || ''
      });
    },
    // --- v18 (SQL 22): お知らせ・チーム分け・出席率・リマインド ---
    // レベル設定 (SQL 22): p_skill_level は 'S'/'A'/'B'/'C'/'D'、null でクリア。
    adminSetSkillLevel: function (memberNo, skillLevel) {
      return callRpc('admin_set_skill_level', { p_member_no: memberNo, p_skill_level: skillLevel || null });
    },
    adminSendAnnouncement: function (practiceId, message) {
      return callRpc('admin_send_announcement', { p_practice_id: practiceId, p_message: message });
    },
    adminListAnnouncements: function (practiceId) {
      return callRpc('admin_list_announcements', { p_practice_id: practiceId });
    },
    adminDeleteAnnouncement: function (announcementId) {
      return callRpc('admin_delete_announcement', { p_announcement_id: announcementId });
    },
    // チーム分けの保存。teams は [{member_no, team_no}] の配列。
    adminSaveTeams: function (practiceId, teams) {
      return callRpc('admin_save_teams', { p_practice_id: practiceId, p_teams: teams });
    },
    adminListTeams: function (practiceId) {
      return callRpc('admin_list_teams', { p_practice_id: practiceId });
    },
    // 開催済み練習の出欠入力。attendance は 'attended'/'absent'/null (未入力に戻す)。
    adminSetAttendance: function (practiceId, memberNo, attendance) {
      return callRpc('admin_set_attendance', {
        p_practice_id: practiceId, p_member_no: memberNo, p_attendance: attendance || null
      });
    },
    adminMemberStats: function () { return callRpc('admin_member_stats', {}); },
    adminMemberStatsRange: function (from, to) { return callRpc('admin_member_stats_range', { p_from: from || null, p_to: to || null }); },
    // 明日のリマインドを手動送信。{ok, practices, reminded} を返す。
    adminSendReminders: function () { return callRpc('admin_send_reminders', {}); },
    adminListMembers: function (query) {
      return callRpc('admin_list_members', { p_query: query || '' });
    },
    // 監査ログ (SQL 26)。opts: {limit, offset, action, actorRole, memberNo, days}
    adminListAuditLogs: function (opts) {
      opts = opts || {};
      return callRpc('admin_list_audit_logs', {
        p_limit: opts.limit || 100,
        p_offset: opts.offset || 0,
        p_action: opts.action || null,
        p_actor_role: opts.actorRole || null,
        p_member_no: opts.memberNo || null,
        p_days: opts.days || null
      });
    },
    adminCreateMember: function (m) {
      return callRpc('admin_create_member', {
        p_real_name: m.realName, p_line_name: m.lineName, p_gender: m.gender, p_birth_date: m.birthDate,
        p_age: m.age !== undefined ? m.age : null,
        p_volleyball_experience: m.volleyballExperience || null,
        p_position: m.position || null
      });
    },
    // ユニフォーム購入フラグの即時切替 (SQL 27)。
    adminSetUniformPurchased: function (memberNo, purchased) {
      return callRpc('admin_set_uniform_purchased', { p_member_no: memberNo, p_purchased: !!purchased });
    },
    adminUpdateMember: function (memberNo, m) {
      return callRpc('admin_update_member', {
        p_member_no: memberNo, p_real_name: m.realName, p_line_name: m.lineName,
        p_gender: m.gender, p_birth_date: m.birthDate, p_admin_note: m.adminNote || '',
        p_age: m.age !== undefined ? m.age : null,
        p_volleyball_experience: m.volleyballExperience || null,
        p_position: m.position || null,
        p_uniform_purchased: m.uniformPurchased !== undefined ? m.uniformPurchased : null
      });
    },
    adminResetPin: function (memberNo) { return callRpc('admin_reset_pin', { p_member_no: memberNo }); },
    adminRevokeDevices: function (memberNo) { return callRpc('admin_revoke_devices', { p_member_no: memberNo }); },
    adminMarkRegular: function (memberNo, reason) {
      return callRpc('admin_mark_regular', { p_member_no: memberNo, p_reason: reason || '' });
    },
    adminSetLineGroupJoined: function (memberNo, joinedDate) {
      return callRpc('admin_set_line_group_joined', { p_member_no: memberNo, p_joined_date: joinedDate });
    },
    adminListLeaves: function (memberNo) { return callRpc('admin_list_leaves', { p_member_no: memberNo }); },
    adminAddLeave: function (memberNo, startDate, endDate, reason) {
      return callRpc('admin_add_leave', {
        p_member_no: memberNo, p_start_date: startDate, p_end_date: endDate, p_reason: reason || ''
      });
    },
    adminEndLeave: function (leaveId) { return callRpc('admin_end_leave', { p_leave_id: leaveId }); },
    adminListWithdrawalCandidates: function () { return callRpc('admin_list_withdrawal_candidates', {}); },
    adminHoldWithdrawal: function (memberNo, holdUntil, note) {
      return callRpc('admin_hold_withdrawal', {
        p_member_no: memberNo, p_hold_until: holdUntil, p_note: note || ''
      });
    },
    adminConfirmWithdrawal: function (memberNo, note) {
      return callRpc('admin_confirm_withdrawal', { p_member_no: memberNo, p_note: note || '' });
    },
    adminDeleteMember: function (memberNo) {
      return callRpc('admin_delete_member', { p_member_no: memberNo });
    },
    adminListRegistrationRequests: function () { return callRpc('admin_list_registration_requests', {}); },
    adminApproveRequest: function (requestId) {
      return callRpc('admin_approve_request', { p_request_id: requestId });
    },
    adminRejectRequest: function (requestId, reason) {
      return callRpc('admin_reject_request', { p_request_id: requestId, p_reason: reason || '' });
    },
    adminMonthlyStats: function (year, month) {
      return callRpc('admin_monthly_stats', { p_year: year, p_month: month });
    },
    adminExportAttendanceCsv: function (year, month) {
      return callRpc('admin_export_attendance_csv', { p_year: year, p_month: month });
    },
    adminExportMembersCsv: function () { return callRpc('admin_export_members_csv', {}); },
    adminListAdmins: function () { return callRpc('admin_list_admins', {}); },
    adminGrantAdmin: function (memberNo, role) {
      return callRpc('admin_grant_admin', { p_member_no: memberNo, p_role: role || 'admin' });
    },
    adminLinkAuth: function (authUserId, memberNo) {
      return callRpc('admin_link_auth', { p_auth_user_id: authUserId, p_member_no: memberNo });
    },
    // 管理者招待メールの送信 (Edge Function invite-admin)。
    // オーナーのセッショントークンで呼び、招待済み/既存ユーザーの Auth ID を返す。
    inviteAdmin: async function (email) {
      var sb = getClient();
      var sessionRes = await sb.auth.getSession();
      var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
      var token = session ? session.access_token : '';
      if (!token) { throw new Error('管理者としてログインし直してください。'); }
      var url = config.SUPABASE_URL + '/functions/v1/invite-admin';
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': config.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ email: email })
      });
      var data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        var msg = (data && data.error) ? data.error : ('招待メールの送信に失敗しました。(' + res.status + ')');
        if (msg === 'not_owner') { msg = 'オーナーのみ実行できます。'; }
        if (msg === 'invalid_email') { msg = 'メールアドレスを確認してください。'; }
        if (msg === 'unauthorized') { msg = '管理者としてログインし直してください。'; }
        var err = new Error(msg);
        err.code = data && data.error;
        throw err;
      }
      return data;
    },
    adminRevokeAdmin: function (memberNo) { return callRpc('admin_revoke_admin', { p_member_no: memberNo }); },
    adminListUnnotified: function () { return callRpc('admin_list_unnotified', {}); },
    adminMarkNotified: function (registrationId, kind) {
      return callRpc('admin_mark_notified', { p_registration_id: registrationId, p_kind: kind });
    },
    adminListMailOutbox: function () { return callRpc('admin_list_mail_outbox', {}); },
    adminRetryMail: function (outboxId) { return callRpc('admin_retry_mail', { p_outbox_id: outboxId }); },
    adminMailStatus: function () { return callRpc('admin_mail_status', {}); },
    setMyEmailNotify: function (enabled) {
      return callRpc('set_my_email_notify', { p_enabled: !!enabled });
    },
    getMyEmailNotify: function () {
      return callRpc('get_my_email_notify', {}).then(function (res) {
        if (res && typeof res.notify_email === 'boolean') { return res.notify_email; }
        return true;
      });
    },
    adminCreateScheduleRule: function (r) {
      return callRpc('admin_create_schedule_rule', {
        p_weekday: r.weekday, p_interval_weeks: r.intervalWeeks, p_anchor_date: r.anchorDate,
        p_start_time: r.startTime, p_end_time: r.endTime, p_venue: r.venue, p_capacity: r.capacity
      });
    },
    adminListScheduleRules: function () { return callRpc('admin_list_schedule_rules', {}); },
    adminDisableScheduleRule: function (ruleId) {
      return callRpc('admin_disable_schedule_rule', { p_rule_id: ruleId });
    },
    adminGeneratePractices: function (fromDate, toDate) {
      return callRpc('admin_generate_practices', { p_from_date: fromDate, p_to_date: toDate });
    },
    purgeWithdrawnMembers: function () { return callRpc('purge_withdrawn_members', {}); },

    // --- 管理者ログイン (Supabase Auth メール/パスワード) ---
    signInAdmin: async function (email, password) {
      var sb = getClient();
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) { throw new Error(rpcErrorMessage(res.error)); }
      return res.data;
    },
    signOutAdmin: async function () {
      var sb = getClient();
      await sb.auth.signOut();
    },
    // 招待・パスワード再設定リンクから来たセッションで新しいパスワードを設定する。
    updateAdminPassword: async function (newPassword) {
      var sb = getClient();
      var res = await sb.auth.updateUser({ password: newPassword });
      if (res.error) { throw new Error(rpcErrorMessage(res.error)); }
      return res.data;
    },
    getAdminSession: async function () {
      var sb = getClient();
      var res = await sb.auth.getSession();
      if (res.error) { throw new Error(rpcErrorMessage(res.error)); }
      return res.data && res.data.session ? res.data.session : null;
    },
    onAdminAuthChange: function (cb) {
      var sb = getClient();
      return sb.auth.onAuthStateChange(cb);
    }
  };

  window.VstarsApi = api;
})();
