-- ============================================================
-- AI抽出フィールド追加マイグレーション
-- Claude Vision API で抽出した追加情報を保存するためのカラム
-- ============================================================
-- 実行方法:
--   1. Supabase ダッシュボード → SQL Editor
--   2. 以下の SQL を貼り付けて Run
--   3. 既に適用済みの場合も IF NOT EXISTS で安全に再実行可能
-- ============================================================

ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS phone_number  TEXT,
    ADD COLUMN IF NOT EXISTS invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS store_address  TEXT,
    ADD COLUMN IF NOT EXISTS ai_confidence  INTEGER;

-- インボイス番号で検索できるようにインデックスを追加 (任意)
CREATE INDEX IF NOT EXISTS idx_receipts_invoice_number
    ON receipts (invoice_number)
    WHERE invoice_number IS NOT NULL;

-- 各カラムのコメント
COMMENT ON COLUMN receipts.phone_number  IS 'Claude Vision が抽出した店舗電話番号 (ハイフン区切り)';
COMMENT ON COLUMN receipts.invoice_number IS '適格請求書発行事業者登録番号 (T + 13桁)';
COMMENT ON COLUMN receipts.store_address  IS 'Claude Vision が抽出した店舗住所';
COMMENT ON COLUMN receipts.ai_confidence  IS 'AI抽出の信頼度スコア (0-100)';
