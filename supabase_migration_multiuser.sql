-- ============================================================
-- マイグレーション: マルチユーザー対応
-- 既に receipts テーブルが存在する場合に実行する
-- helper_email / helper_name カラムを追加し、helper_master と連携
--
-- 使い方:
--   1. Supabase SQL Editor にこの内容を貼り付け
--   2. Run
-- ============================================================

-- 1. receipts テーブルに helper_email / helper_name カラム追加
ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS helper_email TEXT,
    ADD COLUMN IF NOT EXISTS helper_name  TEXT;

-- 2. インデックス (検索高速化)
CREATE INDEX IF NOT EXISTS idx_receipts_helper_email ON receipts(helper_email);

-- 3. 既存の NULL データを (もしあれば) 既定値で埋める
--    ※マイグレーション前のレシートには所有者情報が無いので
--    "system" 扱いで残しておく
UPDATE receipts
SET helper_email = 'system@migration',
    helper_name = 'system'
WHERE helper_email IS NULL;

-- 4. helper_email を必須化 (今後の登録で NULL を許さない)
ALTER TABLE receipts
    ALTER COLUMN helper_email SET NOT NULL;

-- ============================================================
-- 確認クエリ (実行不要・結果を見るだけ)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'receipts'
-- ORDER BY ordinal_position;
