-- ============================================================
-- admin_user_prefs : 管理者アプリの個人設定
-- 2026-05-04 追加
--
-- 用途: ユーザーごとにナビバーの表示項目をカスタマイズ可能にする
--   - email: ログインユーザー (Firebase Auth の email、小文字正規化)
--   - hidden_nav_items: 非表示にしたいナビ項目の配列 (例: ['/training.html', '/audit/'])
--     NULL or 空配列 = 全表示
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_user_prefs (
  email text PRIMARY KEY,
  hidden_nav_items text[] DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE admin_user_prefs IS '管理者アプリの個人カスタマイズ設定 (ナビ表示項目など)';
COMMENT ON COLUMN admin_user_prefs.email IS 'ログインユーザーの email (小文字正規化)';
COMMENT ON COLUMN admin_user_prefs.hidden_nav_items IS '非表示にしたいナビ項目の href 配列 (NULL/空 = 全表示)';
