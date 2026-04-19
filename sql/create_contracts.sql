-- ============================================================
-- 電子契約システム
-- 設計書: docs/CONTRACTS_DESIGN.md / docs/CONTRACTS_PHASE0.md
-- RULES.md 準拠: 既存テーブル変更なし、新規テーブルのみ追加
-- 既存テーブル helper_master / notifications / admin_users への影響:
--   - helper_master: SELECT 参照のみ（FK でも参照しない・email 文字列キー連携で疎結合）
--   - notifications: 既存列のみ使用、新しい type 値 'contract_sign_request' を流す
--   - admin_users: 契約系 API の認可で流用
-- ============================================================

-- ============================================================
-- 1. contract_templates: 契約テンプレートマスタ
-- 本文 PDF と差し込みフィールド定義を保持。改訂時はバージョンを上げて新レコードを作る
-- （過去の締結済契約は旧バージョンを参照し続けるため、is_active=false でも残す）
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 契約種別
  -- employment        : ヘルパー雇用契約
  -- nda               : 秘密保持契約
  -- service_agreement : 事業所間の業務委託契約
  -- important_matter  : 利用者向け重要事項説明書（国定型）
  -- usage_contract    : 利用契約書（将来用）
  kind TEXT NOT NULL,

  title TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,

  -- 本文 PDF。Firebase Storage の URL または Signed URL 取得用キー
  source_pdf_url TEXT,
  source_pdf_storage_key TEXT,   -- Storage 内のオブジェクトキー（将来の URL 切替に備える）

  -- 差し込みフィールド定義（配列）
  -- 例:
  -- [
  --   {"key":"helper_name","label":"氏名","required":true,"source":"helper_master.name"},
  --   {"key":"start_date","label":"契約開始日","required":true,"type":"date"},
  --   {"key":"hourly_wage","label":"時給","required":true,"type":"integer"}
  -- ]
  fillable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 署名位置の座標（外部API に送る際の widget 指定用）
  -- [
  --   {"party_role":"principal","signing_order":0,"page":2,"x":400,"y":120,"width":160,"height":40}
  -- ]
  signature_positions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- メタ情報
  is_active BOOLEAN NOT NULL DEFAULT true,    -- 論理削除フラグ（旧バージョンは false で残す）
  created_by TEXT,                            -- 作成者メール
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_kind       ON contract_templates(kind);
CREATE INDEX IF NOT EXISTS idx_contract_templates_active     ON contract_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_contract_templates_kind_active ON contract_templates(kind, is_active);

COMMENT ON TABLE  contract_templates IS '電子契約テンプレートマスタ。改訂は version を上げた新レコードで行う';
COMMENT ON COLUMN contract_templates.kind IS 'employment / nda / service_agreement / important_matter / usage_contract';
COMMENT ON COLUMN contract_templates.fillable_fields IS '差し込みフィールド定義の配列。source に helper_master.name 等を指定すると補完される';
COMMENT ON COLUMN contract_templates.signature_positions IS '外部APIに送る際の署名位置座標の配列';


-- ============================================================
-- 2. contracts: 契約本体
-- 1テンプレート × 1送信先セット = 1レコード
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- テンプレート参照（バージョン込みで固定する）
  template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  template_version INTEGER,

  -- 種別コピー（フィルタを template join せず済ませるため）
  kind TEXT NOT NULL,

  title TEXT NOT NULL,

  -- 状態遷移
  -- draft              : 管理者が作成中
  -- pending_signature  : 外部API に送信済み、署名待ち
  -- signed             : 全署名完了（締結済み）
  -- revoked            : 管理者が撤回
  -- expired            : 期限切れ
  status TEXT NOT NULL DEFAULT 'draft',

  -- 差し込み値（fillable_fields に対応）
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 主体者（どちらも nullable。雇用なら helper_id、利用者契約なら subject_user_id）
  -- FK ではなく文字列キーにして疎結合（helper_master はヘルパーマスタ、subject_user_id は user-schedule-app の利用者ID）
  helper_id TEXT,
  subject_user_id TEXT,

  -- 外部プロバイダ情報
  provider TEXT,                            -- cloudsign / gmosign
  provider_document_id TEXT,                -- 外部API の書類ID

  -- 署名済 PDF の格納先（完了後に保存）
  signed_pdf_url TEXT,
  signed_pdf_storage_key TEXT,

  -- 作成・送信・完了のタイムスタンプ
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                   -- 署名期限（外部API側と合わせる）

  -- 撤回メモ
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_contracts_kind           ON contracts(kind);
CREATE INDEX IF NOT EXISTS idx_contracts_status         ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_helper_id      ON contracts(helper_id);
CREATE INDEX IF NOT EXISTS idx_contracts_subject_user   ON contracts(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at     ON contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_template       ON contracts(template_id);
CREATE INDEX IF NOT EXISTS idx_contracts_provider_doc   ON contracts(provider, provider_document_id);

COMMENT ON TABLE  contracts IS '電子契約本体。契約1件1レコード';
COMMENT ON COLUMN contracts.status IS 'draft / pending_signature / signed / revoked / expired';
COMMENT ON COLUMN contracts.helper_id IS 'ヘルパー雇用契約の場合に設定（helper_master とは文字列キー連携で疎結合）';
COMMENT ON COLUMN contracts.subject_user_id IS '利用者契約の場合に設定（user-schedule-app 側の利用者IDと文字列キー連携）';
COMMENT ON COLUMN contracts.provider IS 'cloudsign / gmosign';


-- ============================================================
-- 3. contract_parties: 署名者・関係者
-- 1契約に複数（本人・代理人・同意者など）
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_parties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

  -- 役割
  -- principal  : 本人（利用者・ヘルパー・事業所代表）
  -- agent      : 代理人（成年後見人 / 家族代理）
  -- guardian   : 保護者（未成年時）
  -- witness    : 立会人
  -- co_signer  : 同意者（家族同意の署名）
  role TEXT NOT NULL,

  name TEXT NOT NULL,
  email TEXT,                               -- 署名通知先（is_signer=true で必須）
  phone TEXT,                               -- SMS 認証用（任意）

  -- 本人との関係（代理人・同意者のみ設定）
  relation_to_subject TEXT,                 -- 配偶者 / 子 / 成年後見人 / など

  -- 署名順（0から連番、同じ値なら並列）
  signing_order INTEGER NOT NULL DEFAULT 0,

  -- 署名必須フラグ（false なら閲覧のみ or 記名のみで実署名は不要）
  is_signer BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_parties_contract ON contract_parties(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_parties_email    ON contract_parties(email);

COMMENT ON TABLE  contract_parties IS '契約の署名者・関係者。代理人署名も本テーブルで管理';
COMMENT ON COLUMN contract_parties.role IS 'principal / agent / guardian / witness / co_signer';
COMMENT ON COLUMN contract_parties.is_signer IS 'false なら閲覧のみ（本人が判断能力を持たず代理人のみ署名するケース）';


-- ============================================================
-- 4. contract_signatures: 署名実績
-- 1 party に対して基本1レコード（再送等で増えることあり）
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES contract_parties(id) ON DELETE CASCADE,

  -- 外部API 側の署名者ID
  provider_signer_id TEXT,

  -- 状態
  -- pending  : 署名依頼送信済み
  -- signed   : 署名完了
  -- declined : 辞退
  status TEXT NOT NULL DEFAULT 'pending',

  -- 署名詳細
  signed_at TIMESTAMPTZ,
  signing_ip TEXT,
  signing_user_agent TEXT,

  -- タイムスタンプ（長期検証性）
  timestamp_token_url TEXT,
  timestamp_token_fingerprint TEXT,

  -- Webhook で受け取ったイベントの生ペイロード（デバッグ・監査用）
  last_webhook_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract ON contract_signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_party    ON contract_signatures(party_id);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_provider ON contract_signatures(provider_signer_id);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_status   ON contract_signatures(status);

COMMENT ON TABLE  contract_signatures IS '各署名者の署名実績。外部API からの Webhook で更新される';
COMMENT ON COLUMN contract_signatures.status IS 'pending / signed / declined';


-- ============================================================
-- 5. contract_audit_log: 監査ログ（append-only）
-- 運用上 UPDATE/DELETE は禁止。すべての契約系 API 操作でエントリを追加する
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,

  -- 操作者（メール）。管理者 / ヘルパー / システム
  actor_email TEXT,
  actor_role TEXT,                          -- admin / helper / subject / system / provider_webhook

  -- 操作
  -- template_created / template_updated / template_deactivated
  -- contract_created / contract_updated / contract_sent / contract_revoked
  -- signature_requested / signature_signed / signature_declined
  -- document_downloaded
  action TEXT NOT NULL,

  -- 詳細
  payload JSONB,

  -- 監査保全用
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_log_contract ON contract_audit_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_audit_log_action   ON contract_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_contract_audit_log_created  ON contract_audit_log(created_at DESC);

COMMENT ON TABLE  contract_audit_log IS '契約操作の監査ログ。append-only で運用';
COMMENT ON COLUMN contract_audit_log.actor_role IS 'admin / helper / subject / system / provider_webhook';


-- ============================================================
-- RLS（Row Level Security）について
-- Phase 2 時点では RLS は OFF のまま（既存テーブルの運用に合わせる）
-- Phase 3 以降で以下のポリシーを検討:
--   - contracts: ヘルパーは helper_id = 自分 かつ status != draft のみ SELECT
--   - contract_signatures / contract_parties: 所属 contract の閲覧権に従う
--   - contract_audit_log: admin_users のみ SELECT、service_role のみ INSERT
-- 現状は Functions 経由でアクセス制御するため anon key 直叩きを想定しない
-- （user-schedule-app でも契約系は Functions 経由）
-- ============================================================


-- ============================================================
-- 参考: notifications への type 追加予定（スキーマ変更は不要、値の追加のみ）
--   - 'contract_sign_request'  : 署名依頼（管理者 → 署名者）
--   - 'contract_signed'        : 他署名者の署名完了（署名者 → 管理者）
--   - 'contract_completed'     : 契約締結完了（全関係者へ）
-- notifications テーブルの既存列（target_email / type / title / body / link_url / created_at / read_at 等）を
-- そのまま使う。ALTER 不要。
-- ============================================================


-- ============================================================
-- 検証クエリの例（Phase 3 実装前の動作確認用）
-- ============================================================
-- 1) テンプレート1件挿入
-- INSERT INTO contract_templates (kind, title, version, fillable_fields)
-- VALUES ('employment', 'ヘルパー雇用契約書 2026年度版', 1,
--   '[{"key":"helper_name","label":"氏名","required":true,"source":"helper_master.name"}]'::jsonb);
--
-- 2) 契約1件挿入
-- INSERT INTO contracts (template_id, template_version, kind, title, field_values, helper_id, created_by_email)
-- SELECT id, version, kind, '山田太郎 2026年度 雇用契約', '{"helper_name":"山田 太郎"}'::jsonb, 'yamada', 'admin@village-support.jp'
-- FROM contract_templates WHERE kind = 'employment' AND is_active = true LIMIT 1;
--
-- 3) 署名者追加
-- INSERT INTO contract_parties (contract_id, role, name, email, signing_order, is_signer)
-- VALUES
--   ((SELECT id FROM contracts ORDER BY created_at DESC LIMIT 1), 'principal', '山田 太郎', 'yamada@example.com', 0, true),
--   ((SELECT id FROM contracts ORDER BY created_at DESC LIMIT 1), 'principal', 'ビレッジひろば 代表', 'admin@village-support.jp', 1, true);
