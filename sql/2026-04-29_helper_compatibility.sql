-- ==========================================================
-- 2026-04-29 ヘルパーセルフマッチング Phase 1A
--
-- 目的: ヘルパー × 利用者の対応可否（⚪︎×シート相当）を Supabase 化し、
--       ヘルパーが「未割当の支援」を自分で拾えるようにする基盤を整備する。
--
-- 既存への影響:
-- - helper_master に列追加（NOT NULL DEFAULT FALSE → 既存行は false で埋まる）
-- - 新テーブル user_helper_compatibility を追加
-- - 既存クエリは無影響（SELECT * していても列が増えるだけ）
--
-- スプレッドシート（⚪︎×シート, 1djiBf7s_JKgkp1Df1K40rCoqyewFBdfBaUnMtGKZLw）
-- との関係: Supabase が正となり、スプレッドシートは将来的に手動更新を停止予定。
-- ==========================================================

-- 1. helper_master に資格・運転可否の列を追加
ALTER TABLE helper_master
  ADD COLUMN IF NOT EXISTS can_drive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS license_juuhou BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS license_koudou BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS license_kyotaku BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS license_idou BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS capabilities_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN helper_master.can_drive IS '車の運転可否';
COMMENT ON COLUMN helper_master.license_juuhou IS '重度訪問介護 修了';
COMMENT ON COLUMN helper_master.license_koudou IS '行動援護 修了';
COMMENT ON COLUMN helper_master.license_kyotaku IS '居宅介護 修了';
COMMENT ON COLUMN helper_master.license_idou IS '移動支援 修了';
COMMENT ON COLUMN helper_master.capabilities_updated_at IS 'ヘルパー本人が最後に資格・運転可否を更新した日時';

-- 2. user_helper_compatibility 新規テーブル
CREATE TABLE IF NOT EXISTS user_helper_compatibility (
  user_name TEXT NOT NULL,
  beneficiary_number TEXT,
  helper_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '×'
    CHECK (status IN ('⚪︎', '×', '△', '1', '2', 'N')),
  status_set_by TEXT NOT NULL DEFAULT 'admin'
    CHECK (status_set_by IN ('helper', 'admin')),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (user_name, helper_email)
);

CREATE INDEX IF NOT EXISTS idx_uhc_helper_email
  ON user_helper_compatibility (helper_email);

CREATE INDEX IF NOT EXISTS idx_uhc_user_name
  ON user_helper_compatibility (user_name);

CREATE INDEX IF NOT EXISTS idx_uhc_status_n
  ON user_helper_compatibility (helper_email, status)
  WHERE status = 'N';

COMMENT ON TABLE user_helper_compatibility IS
  'ヘルパー × 利用者の対応可否マトリクス（⚪︎×シート相当）。Supabase が正、スプレッドシートはバックアップ扱い';
COMMENT ON COLUMN user_helper_compatibility.status IS
  '⚪︎=OK / ×=未経験(未定義のデフォルト) / △=1人で自信なし / 1=2人付で1人対応可 / 2=2人付で相方ありなら可 / N=NG（家族指定など、絶対除外）';
COMMENT ON COLUMN user_helper_compatibility.status_set_by IS
  'helper=ヘルパー本人が設定 / admin=管理者が設定';
COMMENT ON COLUMN user_helper_compatibility.beneficiary_number IS
  '受給者番号。将来 user_master との結合キーに使う想定。現状は空でもよい';

-- 3. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION trg_uhc_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uhc_set_updated_at ON user_helper_compatibility;
CREATE TRIGGER uhc_set_updated_at
  BEFORE UPDATE ON user_helper_compatibility
  FOR EACH ROW
  EXECUTE FUNCTION trg_uhc_set_updated_at();

-- 4. 検証クエリ
--    実行後、列定義が想定通りか確認するために実行する
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_helper_compatibility'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'helper_master'
  AND column_name IN (
    'can_drive', 'license_juuhou', 'license_koudou',
    'license_kyotaku', 'license_idou', 'capabilities_updated_at'
  )
ORDER BY column_name;
