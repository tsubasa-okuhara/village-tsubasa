-- ============================================================
-- Supabase スキーマ (PostgreSQL)
-- 電子帳簿保存法対応 経費精算・レシート管理システム
--
-- ⚠️ このスキーマは既存 Supabase プロジェクト (村サポートの village-tsubasa 等)
-- に追加しても既存データに影響が出ないよう、全テーブル名を receipt_ プレフィックス
-- にしてあります。
--
-- 使い方:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイルの内容を貼り付け
--   3. "Run" ボタンを押す
-- ============================================================

-- receipts テーブル (メイン)
CREATE TABLE IF NOT EXISTS receipts (
    id                BIGSERIAL PRIMARY KEY,
    helper_email      TEXT NOT NULL,              -- 所有者 (helper_master.helper_email)
    helper_name       TEXT,                        -- 表示用の名前
    transaction_date  DATE NOT NULL,
    amount            NUMERIC(12, 2) NOT NULL,
    vendor            TEXT,
    category          TEXT NOT NULL,
    description       TEXT,
    image_path        TEXT,
    image_hash        TEXT UNIQUE,
    image_dpi         INTEGER,
    image_color_mode  TEXT,
    scan_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ocr_raw_text      TEXT,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_receipts_helper_email     ON receipts(helper_email);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_date ON receipts(transaction_date);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor           ON receipts(vendor);
CREATE INDEX IF NOT EXISTS idx_receipts_category         ON receipts(category);
CREATE INDEX IF NOT EXISTS idx_receipts_is_deleted       ON receipts(is_deleted);

-- receipt_audit_log テーブル (監査ログ)
CREATE TABLE IF NOT EXISTS receipt_audit_log (
    log_id          BIGSERIAL PRIMARY KEY,
    receipt_id      BIGINT REFERENCES receipts(id),
    action          TEXT NOT NULL,
    changed_column  TEXT,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by      TEXT DEFAULT 'system',
    reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_receipt_id ON receipt_audit_log(receipt_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON receipt_audit_log(changed_at);

-- receipt_categories テーブル (経費費目マスタ)
-- ※既存の categories テーブル（ヘルパー用等）と衝突しないよう receipt_ プレフィックス
CREATE TABLE IF NOT EXISTS receipt_categories (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期カテゴリーデータ
INSERT INTO receipt_categories (name, is_active)
VALUES
    ('交通費',       TRUE),
    ('接待交際費',   TRUE),
    ('消耗品費',     TRUE),
    ('通信費',       TRUE),
    ('水道光熱費',   TRUE),
    ('地代家賃',     TRUE),
    ('雑費',         TRUE),
    ('その他',       TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- セキュリティ設定: Row Level Security (RLS)
-- ============================================================
-- Streamlit アプリからは service_role キーで接続するため
-- RLS を有効にしても素通りしますが、匿名キー経由の誤アクセスを
-- 防ぐために RLS を有効化しておく。

ALTER TABLE receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_categories  ENABLE ROW LEVEL SECURITY;

-- 物理削除を防ぐトリガー (DELETE禁止)
CREATE OR REPLACE FUNCTION prevent_receipt_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '物理削除は禁止されています。is_deleted フラグを使用してください。';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_receipt_delete ON receipts;
CREATE TRIGGER trg_prevent_receipt_delete
    BEFORE DELETE ON receipts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_receipt_delete();

-- 監査ログの変更・削除を防ぐトリガー (改ざん防止)
CREATE OR REPLACE FUNCTION prevent_receipt_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '監査ログの変更・削除は禁止されています。';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_receipt_audit_update ON receipt_audit_log;
CREATE TRIGGER trg_prevent_receipt_audit_update
    BEFORE UPDATE OR DELETE ON receipt_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_receipt_audit_modification();
