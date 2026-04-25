-- =============================================================
-- enable_rls_group_a.sql
-- =============================================================
-- 目的:
--   Supabase からの `rls_disabled_in_public` / `exposed_sensitive_data`
--   警告に対する Phase 1 対応。
--   service_role（Firebase Functions / GAS）からしかアクセスされない
--   テーブル群に対して Row Level Security を有効化する。
--
-- 前提:
--   service_role キーは RLS を bypass するため、ポリシー無しでも
--   Firebase Functions / GAS は通常動作する。
--   anon / authenticated からのリクエストは全て拒否される（正しい挙動）。
--
-- 対象:
--   - ビレッジつばさ（村翼）Supabase プロジェクト pbqqqwwgswniuomjlhsh
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼り付けて Run
--   ※ ダッシュボードは service_role 扱いなので、適用後も SQL Editor 上は
--     全データが見えることに注意（混乱しないよう）
--
-- 検証:
--   適用後、以下を確認:
--     1) village-tsubasa Functions: /api/today-schedule など主要 API が 200
--     2) village-admin: ダッシュボードのカウント類が通常表示
--     3) GAS「スケジュール逆同期」: 手動で add/edit を1件ずつ
--     4) GAS「全体スケジュール」: 手動同期1回
--
-- ロールバック:
--   本ファイル末尾の ROLLBACK ブロックをコメントアウト解除して実行
--
-- 関連: docs/RLS_MIGRATION_PLAN.md
-- 作成: 2026-04-24（奥原翼 + Claude Opus）
-- =============================================================


-- -------------------------------------------------------------
-- 1. 移動支援（move）系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.schedule_tasks_move       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_notes_move        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.move_check_logs           ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 2. 居宅介護（home）系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.home_schedule_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_notes_home        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_action_logs_home  ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 3. 構造化記録系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.service_record_structured ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_action_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_irregular_events  ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 4. 研修系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.training_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.training_materials        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 5. 落ち着き確認系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.calm_checks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calm_check_targets        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 6. フィードバック系
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.anonymous_feedback        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 7. 通知・プッシュ系
-- -------------------------------------------------------------
-- ⚠️ notifications は user-schedule-app が anon で INSERT するため
--    グループB 送り。本ファイルからは除外。詳細は sql/enable_rls_schedule.sql。
ALTER TABLE IF EXISTS public.push_subscriptions        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 8. 電子契約系（Phase 3 雛形）
-- -------------------------------------------------------------
-- ⚠️ 2026-04-25 時点で Supabase に未作成（sql/create_contracts.sql 未適用）。
--    IF EXISTS を付けているので、テーブル未作成なら黙ってスキップする。
--    将来 sql/create_contracts.sql を Run したらここで自動的に RLS ON される。
ALTER TABLE IF EXISTS public.contracts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_parties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_signatures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_audit_log        ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 9. village-admin 専用
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.admin_users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_error_alerts        ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- 適用後の自己チェック: RLS が ON になっているか確認
-- =============================================================
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN (
--      'schedule_tasks_move','service_notes_move','move_check_logs',
--      'home_schedule_tasks','service_notes_home','service_action_logs_home',
--      'service_record_structured','service_action_logs','service_irregular_events',
--      'training_reports','training_materials',
--      'calm_checks','calm_check_targets',
--      'anonymous_feedback',
--      'push_subscriptions',
--      'contracts','contract_templates','contract_parties',
--      'contract_signatures','contract_audit_log',
--      'admin_users','admin_error_alerts'
--    )
--  ORDER BY tablename;


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- ALTER TABLE IF EXISTS public.schedule_tasks_move       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_notes_move        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.move_check_logs           DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.home_schedule_tasks       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_notes_home        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_action_logs_home  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_record_structured DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_action_logs       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.service_irregular_events  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.training_reports          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.training_materials        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.calm_checks               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.calm_check_targets        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.anonymous_feedback        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.push_subscriptions        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.contracts                 DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.contract_templates        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.contract_parties          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.contract_signatures       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.contract_audit_log        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.admin_users               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.admin_error_alerts        DISABLE ROW LEVEL SECURITY;
