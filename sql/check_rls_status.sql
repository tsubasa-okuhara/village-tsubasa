-- =============================================================
-- check_rls_status.sql
-- =============================================================
-- 目的:
--   Supabase プロジェクト `pbqqqwwgswniuomjlhsh` の全テーブル/ビューに
--   対して、RLS の有効状態と既存ポリシーを一覧する診断クエリ。
--   RLS 段階移行計画 Phase 0 で実行する。
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼り付けて Run。
--   各クエリを個別に実行しても良い。
--
-- 関連: docs/RLS_MIGRATION_PLAN.md
-- 作成: 2026-04-24
-- =============================================================


-- -------------------------------------------------------------
-- Query 1: public スキーマの全テーブルの RLS 有効状態
-- -------------------------------------------------------------
-- rowsecurity が true なら RLS 有効、false なら無効
-- forcerowsecurity が true なら service_role すら bypass されない
SELECT
  n.nspname        AS schema_name,
  c.relname        AS table_name,
  c.relkind        AS kind,            -- 'r' = table, 'v' = view, 'm' = matview
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','v','m','p')   -- 通常テーブル / ビュー / マテビュー / パーティション親
ORDER BY c.relrowsecurity DESC, c.relname;


-- -------------------------------------------------------------
-- Query 2: 既存ポリシー一覧（ポリシー名・コマンド・対象ロール・USING/WITH CHECK）
-- -------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual       AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- -------------------------------------------------------------
-- Query 3: RLS OFF のテーブル数サマリ（警告メールと照合用）
-- -------------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_off_count,
  COUNT(*) FILTER (WHERE     c.relrowsecurity) AS rls_on_count,
  COUNT(*)                                     AS total_public_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';


-- -------------------------------------------------------------
-- Query 4: テーブルごとの付与権限（ANON / AUTHENTICATED へ GRANT されているか）
-- -------------------------------------------------------------
-- Supabase の anon / authenticated ロールが各テーブルにどの権限を
-- 持っているかを確認。RLS OFF でも GRANT が無ければアクセス不可。
SELECT
  table_schema,
  table_name,
  grantee,
  STRING_AGG(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY table_schema, table_name, grantee
ORDER BY table_name, grantee;


-- -------------------------------------------------------------
-- Query 5: センシティブ列っぽい名前を含むテーブル（警告対象の候補推定）
-- -------------------------------------------------------------
SELECT
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
       column_name ILIKE '%email%'
    OR column_name ILIKE '%password%'
    OR column_name ILIKE '%phone%'
    OR column_name ILIKE '%address%'
    OR column_name ILIKE '%beneficiary%'
    OR column_name ILIKE '%token%'
    OR column_name ILIKE '%secret%'
    OR column_name ILIKE '%key%'
  )
ORDER BY table_name, column_name;
