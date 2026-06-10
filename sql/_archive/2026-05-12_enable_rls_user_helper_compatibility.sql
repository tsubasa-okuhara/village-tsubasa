-- =============================================================
-- 2026-05-12 user_helper_compatibility の RLS を有効化
-- =============================================================
-- 目的:
--   `user_helper_compatibility` は 2026-04-29 に追加された ⚪︎× マトリクスだが、
--   RLS が OFF のまま（28 テーブル中で唯一の OFF）。anon キーで素読み・素書きが
--   可能な状態。行数は 0 で実害ゼロだが、portal_* 拡張前に閉じる。
--
-- 方針: ENABLE ROW LEVEL SECURITY のみ（policy は作らない）
--   - policy が 0 件なら anon / authenticated からのアクセスは全て不許可
--   - Firebase Functions が service_role キーで叩く既存パターンには影響なし
--   - 将来ヘルパー本人が更新する画面ができたら、その時点で
--     `helper_email = current_setting('request.jwt.claims', true)::json->>'email'` 等の
--     ポリシーを追加する（本 PR では入れない）
--
-- portal_* への影響: なし（user_helper_compatibility は portal_* テーブルと無関係）
-- 既存 RLS ポリシー変更: なし（policy 追加・削除どちらもなし）
--
-- 関連: SUPABASE_SCHEMA.md §12.6 改善候補 1
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼って Run
--
-- ロールバック: 末尾のブロック参照
-- =============================================================

ALTER TABLE IF EXISTS public.user_helper_compatibility
  ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- 適用後の自己チェック
-- =============================================================
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename  = 'user_helper_compatibility';
-- → rowsecurity = true なら OK
--
-- SELECT COUNT(*) FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename  = 'user_helper_compatibility';
-- → 0 で OK（service_role 専用）


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- ALTER TABLE IF EXISTS public.user_helper_compatibility DISABLE ROW LEVEL SECURITY;
