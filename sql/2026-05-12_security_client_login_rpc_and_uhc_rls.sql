-- =============================================================
-- 2026-05-12_security_client_login_rpc_and_uhc_rls.sql
-- =============================================================
-- 目的:
--   1) client_users.login_code を anon キーから読み取れないようにする
--      （Phase 3 の `client_users_anon_all` ポリシーで anon が全列 SELECT
--       できてしまう問題への対応）
--   2) user_helper_compatibility テーブルの RLS が無効なまま放置されて
--      いる問題を解消する
--
-- 採用方針:
--   1) SECURITY DEFINER RPC `client_login(p_name, p_code)` を新設し、
--      anon は RPC 経由でのみログイン照合できるようにする。
--      anon の client_users への直接 SELECT は禁止する。
--   2) user_helper_compatibility は RLS を有効化しポリシー無しとする。
--      現状アクセスは GAS の service_role 経由のみ（grep 確認済み）の
--      ため、ポリシー無しでも既存挙動は無影響。
--
-- 既存への影響:
--   - portal_* テーブル群は本 SQL では一切触らない
--   - Phase 1/3 で適用済みの他 RLS ポリシーも変更しない
--     （schedule / helper_master / notifications / Group A 17 テーブル等）
--   - schedule_claims（Phase 1, 2026-05-06 適用済み RLS ON / no policy）
--     にも触らない
--   - service_role からのアクセスは RLS を bypass するため Firebase
--     Functions / GAS は無影響
--   - user-schedule-app/index.html の DB 呼び出しを「直接 SELECT」から
--     「RPC client_login」に切り替える必要がある（別コミットで対応）
--
-- 適用手順:
--   1. user-schedule-app/index.html の RPC 切り替えを先にデプロイ
--      （旧 anon SELECT 経路は本 SQL 適用と同時に動かなくなる）
--   2. Supabase Dashboard → SQL Editor に本ファイルを貼り付けて Run
--   3. 本ファイル末尾の検証クエリを実行して結果を確認
--   4. user-schedule-app からログインできることを実機確認
--
-- 検証チェックリスト:
--   [ ] anon キーで `select login_code from client_users` が空 or エラー
--   [ ] anon キーで `rpc('client_login', {...})` が想定どおり1件返す
--   [ ] user_helper_compatibility が RLS ON
--   [ ] GAS 「対応可否シート移行」が引き続き動く（service_role なので OK のはず）
--   [ ] portal_* テーブルのポリシーが本適用前後で diff ゼロ
--
-- ロールバック:
--   本ファイル末尾の ROLLBACK ブロックをコメントアウト解除して実行
--
-- 関連:
--   - docs/SUPABASE_SCHEMA.md §8.5 client_users
--   - docs/RLS_MIGRATION_PLAN.md
--   - sql/enable_rls_schedule.sql （Phase 3 で `client_users_anon_all` を作成）
--   - sql/2026-04-29_helper_compatibility.sql （UHC 作成、RLS 未設定だった）
-- =============================================================


-- -------------------------------------------------------------
-- 1. client_users: anon の直接 SELECT を禁止し、RPC 経由に切り替え
-- -------------------------------------------------------------

-- 1-1. 旧ポリシー（anon 全許可）を撤去
--      RLS は ON のまま。ポリシー無しなら anon からは何もできない。
--      service_role は RLS を bypass するので Firebase Functions /
--      管理ダッシュボード（service_role 利用）は無影響。
DROP POLICY IF EXISTS client_users_anon_all ON public.client_users;

-- 1-2. ログイン用 RPC を作成
--      入力:
--        p_name : 利用者名（半角・全角スペース無視で照合）
--        p_code : 4 桁ログインコード
--      出力:
--        ログイン成功時 1 行、失敗時 0 行
--      返却列に login_code は含めない（漏洩防止の主目的）
--
-- 注意: client_users.service_types の実型は text[]（postgres 配列）。
--       RETURNS TABLE 側を text[] で一致させないと
--       42P13 "return type mismatch" エラーになる。
--       PostgREST は text[] を JSON 配列としてシリアライズするので、
--       user-schedule-app/index.html の `JSON.stringify(user.service_types || [])`
--       はそのまま機能する。
--
-- 補足: 万一前回失敗時に関数が部分的に残っていたら、CREATE OR REPLACE は
--       戻り値型の変更を許さないため明示的に DROP しておく。
DROP FUNCTION IF EXISTS public.client_login(text, text);

CREATE FUNCTION public.client_login(
  p_name text,
  p_code text
)
RETURNS TABLE (
  id                 uuid,
  client_name        text,
  beneficiary_number text,
  service_types      text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    cu.id,
    cu.client_name,
    cu.beneficiary_number,
    cu.service_types
  FROM public.client_users cu
  WHERE cu.is_active = true
    AND cu.login_code = p_code
    AND (
      replace(replace(cu.client_name, ' ', ''), '　', '')
        = replace(replace(p_name, ' ', ''), '　', '')
      OR replace(replace(cu.client_name, ' ', ''), '　', '')
        LIKE '%' || replace(replace(p_name, ' ', ''), '　', '') || '%'
    );
$$;

COMMENT ON FUNCTION public.client_login(text, text) IS
  'user-schedule-app からのログイン照合用 RPC。anon が client_users.login_code を直接読めないようにするため、SECURITY DEFINER で照合だけ行い結果から login_code を除外して返す。';

-- 1-3. anon に EXECUTE 権限を付与
--      （PUBLIC からは念のため REVOKE）
REVOKE ALL ON FUNCTION public.client_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.client_login(text, text) TO authenticated;


-- -------------------------------------------------------------
-- 2. user_helper_compatibility: RLS を有効化（ポリシー無し）
-- -------------------------------------------------------------
-- アクセス元:
--   - gas/village-schedule-sync/対応可否シート移行.gs
--     → service_role キー使用 (SUPABASE_SERVICE_KEY)
--   - 他に anon / authenticated からのアクセスは grep でゼロ確認
-- service_role は RLS を bypass するため、ポリシー無しでも GAS は動く。
ALTER TABLE IF EXISTS public.user_helper_compatibility
  ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- 適用後の自己チェッククエリ
-- =============================================================
-- -- (a) RLS 状態
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('client_users', 'user_helper_compatibility')
--  ORDER BY tablename;
--
-- -- (b) ポリシー一覧（client_users_anon_all が消えていることを確認）
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('client_users', 'user_helper_compatibility')
--  ORDER BY tablename, policyname;
--
-- -- (c) RPC の存在と権限
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args,
--        prosecdef AS is_security_definer
--   FROM pg_proc
--  WHERE proname = 'client_login'
--    AND pronamespace = 'public'::regnamespace;
--
-- SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--  WHERE specific_schema = 'public'
--    AND routine_name = 'client_login';
--
-- -- (d) RPC 動作確認（実在ユーザーで）
-- SELECT * FROM public.client_login('テスト利用者名', '0000');


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- -- 1) client_users 関連
-- REVOKE EXECUTE ON FUNCTION public.client_login(text, text) FROM anon;
-- REVOKE EXECUTE ON FUNCTION public.client_login(text, text) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.client_login(text, text);
-- CREATE POLICY client_users_anon_all
--   ON public.client_users
--   FOR ALL
--   TO anon
--   USING (true)
--   WITH CHECK (true);
--
-- -- 2) user_helper_compatibility
-- ALTER TABLE IF EXISTS public.user_helper_compatibility
--   DISABLE ROW LEVEL SECURITY;
