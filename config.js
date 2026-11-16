// Vstars 出欠 — Supabase 接続設定
// dev プロジェクト vstars-attendance-dev の公開キー。
// publishable key は公開前提のキー。service_role キーは絶対に入れないこと。
window.VSTARS_CONFIG = {
  SUPABASE_URL: 'https://msnrbgryiganmdaitdym.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_s75fbYSRXpM9SSmHuDQi4g_SGwCkS5a',
  // Web Push (VAPID) 公開鍵。公開してよい鍵。秘密鍵は Edge Function 側のみ。
  VAPID_PUBLIC_KEY: 'BC574TfHQKuXEgzj_jY6SwoPBgDsoQx7w18UUifpKQD40eEITcEfJxcMYHC2o1wymHpZQxj_iQLMFoIFBavP_t4'
};
