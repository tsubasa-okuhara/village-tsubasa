-- =============================================================
-- 2026-05-12 client_users.login_code を anon から見えないようにする
-- =============================================================
-- 目的:
--   `client_users.login_code` は利用者アプリの認証シークレットだが、
--   現状 `client_users_anon_all` (FOR ALL TO anon USING true) により
--   anon キーで全行・全列 SELECT 可能（116 件の login_code が露出）。
--   anon に対して `login_code` 列だけを不可視化する。
--
-- 方針: 列レベル GRANT/REVOKE + SECURITY DEFINER RPC
--   - RLS ポリシー `client_users_anon_all` 自体は変更しない（最小差分）
--   - 新規 SECURITY DEFINER 関数 `public.verify_client_login(p_name, p_code)` を作成し、
--     利用者アプリのログイン処理だけがこの関数経由で照合する形に置き換える
--   - REVOKE SELECT (login_code) ON public.client_users FROM anon で列を遮断
--
-- portal_* への影響: なし（client_users への新ポリシーは作らない、新テーブルは無関係）
-- 既存 RLS ポリシー変更: なし（policies はそのまま、列レベル grant のみ調整）
--
-- 関連: SUPABASE_SCHEMA.md §12.6 改善候補 3
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼って Run
--   STEP 1 → STEP 2 → user-schedule-app をデプロイし動作確認 → STEP 3 の順で実行
--
-- ロールバック: 末尾のブロック参照
-- =============================================================


-- -------------------------------------------------------------
-- STEP 1. SECURITY DEFINER 関数で「名前部分一致 + login_code 完全一致」の
--         認証 1 クエリだけ anon に公開する
--
--   - SECURITY DEFINER で実行するので RLS ポリシーと列レベル GRANT を
--     バイパスできる（関数所有者 = postgres ロールの権限で評価される）
--   - 戻り値に login_code を含めない（必要な 4 列だけ返す）
--   - search_path を固定して Function Search Path Mutable 警告を回避
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_client_login(
  p_name TEXT,
  p_code TEXT
)
RETURNS TABLE (
  id                  UUID,
  client_name         TEXT,
  beneficiary_number  TEXT,
  service_types       TEXT[]
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
  FROM public.client_users AS cu
  WHERE cu.is_active = true
    AND cu.client_name ILIKE '%' || p_name || '%'
    AND cu.login_code = p_code
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.verify_client_login(TEXT, TEXT) IS
  'user-schedule-app 専用ログイン照合。名前部分一致 + login_code 完全一致で 1 行返す。SECURITY DEFINER で実行され、戻り値に login_code は含めない';

-- 関数の所有者は postgres（= テーブル所有者）であることが前提。
-- 念のため EXECUTE を public から剥がして anon に明示付与する。
REVOKE ALL ON FUNCTION public.verify_client_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_login(TEXT, TEXT) TO anon;


-- -------------------------------------------------------------
-- STEP 2. ここで user-schedule-app/index.html を `.rpc('verify_client_login', ...)`
--         に差し替えてデプロイ → ブラウザで実機ログイン確認まで完了させる。
--         確認できる前に STEP 3 を流すと利用者がログインできなくなる。
-- -------------------------------------------------------------


-- -------------------------------------------------------------
-- STEP 3. anon から login_code 列の SELECT を剥がす
--
--   - PostgreSQL は WHERE 句で参照する列にも SELECT 権が必要なので、
--     これだけで anon の旧コード（`.eq('login_code', code)`）は失敗する。
--     STEP 2 のデプロイが完了していることを必ず先に確認する。
--   - INSERT/UPDATE 権限は anon に元々付いていない（GRANT 履歴なし）。
--     念のため REVOKE INSERT/UPDATE/REFERENCES も入れて意図を明示する。
-- -------------------------------------------------------------
REVOKE SELECT (login_code) ON public.client_users FROM anon;

-- 防御的: 仮に過去に INSERT/UPDATE が付与されていても剥がす（無ければ no-op）
REVOKE INSERT (login_code), UPDATE (login_code), REFERENCES (login_code)
  ON public.client_users FROM anon;


-- =============================================================
-- 適用後の自己チェック（Supabase Dashboard で実行）
-- =============================================================
-- 1. 関数が anon 向けに公開されたか
-- SELECT  p.proname,
--         pg_catalog.pg_get_userbyid(p.proowner) AS owner,
--         p.prosecdef AS security_definer,
--         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
--   FROM  pg_proc p
--   JOIN  pg_namespace n ON n.oid = p.pronamespace
--  WHERE  n.nspname = 'public'
--    AND  p.proname = 'verify_client_login';
--
-- 2. anon が login_code 列を読めないか
-- SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--  WHERE table_schema = 'public'
--    AND table_name   = 'client_users'
--    AND column_name  = 'login_code';
-- （anon の SELECT 行が消えていれば OK）
--
-- 3. anon でログイン RPC が機能するか（Supabase Dashboard の API キーで叩く）
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/verify_client_login" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"p_name":"テスト","p_code":"0000"}'


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- GRANT SELECT (login_code) ON public.client_users TO anon;
-- DROP FUNCTION IF EXISTS public.verify_client_login(TEXT, TEXT);
