-- =============================================================
-- enable_rls_schedule.sql  (Phase 3 / 選択肢A 確定版)
-- =============================================================
-- 目的:
--   RLS 段階移行計画 Phase 3 用。user-schedule-app（GitHub Pages、
--   anon キー）が直接叩いているテーブル群に対して、anon の現在の
--   操作を全て許可するポリシーを付けつつ RLS を有効化する。
--
-- 採用方針: 選択肢A（anon 全許可で警告だけ消す）
--   - 理由1: user-schedule-app が schedule を WHERE 無し全件取得して
--     クライアント側でフィルタしている設計のため、DB 側で利用者ごとに
--     絞る選択肢B には user-schedule-app の大幅改修が必要
--   - 理由2: Supabase 警告メールへの即時対応を優先
--   - 厳密化（選択肢B 相当）は Phase 4 で別途検討
--
-- 確認したアクセスパターン（2026-04-25 時点）:
--   user-schedule-app/schedule.html:
--     - schedule_web_v       SELECT
--     - schedule             SELECT / INSERT / UPDATE / DELETE
--     - notifications        INSERT
--   user-schedule-app/index.html:
--     - client_users         (操作未確認、保守的に FOR ALL)
--   user-schedule-app/records.html:
--     - schedule_web_v       SELECT
--     - schedule             SELECT / UPDATE
--   user-schedule-app/mypage.html:
--     - DB アクセス無し
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼って Run
--
-- 検証（適用直後に必ず実施）:
--   [ ] 奥原さんの端末で user-schedule-app を開いて schedule.html の
--       予定一覧が表示される
--   [ ] schedule.html で予定を追加 → スプレッドシート即時反映が成功
--   [ ] schedule.html で予定を編集 → 同上
--   [ ] schedule.html で予定をキャンセル → 同上
--   [ ] index.html / records.html も開いて崩れがないか目視
--
-- ロールバック:
--   本ファイル末尾の ROLLBACK ブロックをコメントアウト解除して実行
--
-- 関連: docs/RLS_MIGRATION_PLAN.md Phase 3
-- 作成: 2026-04-24（DRAFT）→ 2026-04-25 確定（schedule.html 実調査後）
-- =============================================================


-- -------------------------------------------------------------
-- 1. schedule: anon に全操作許可
-- -------------------------------------------------------------
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_anon_all
  ON public.schedule
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);


-- -------------------------------------------------------------
-- 2. helper_master: schedule_web_v JOIN 用の SELECT 許可
-- -------------------------------------------------------------
-- user-schedule-app は helper_master を直接叩いていないが、
-- schedule_web_v ビュー内で helper_email 補完のために JOIN している。
-- ビューが security_invoker で動作する場合、anon にも基底テーブルの
-- SELECT 権が必要なため許可しておく。
ALTER TABLE public.helper_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY helper_master_anon_select
  ON public.helper_master
  FOR SELECT
  TO anon
  USING (true);


-- -------------------------------------------------------------
-- 3. notifications: user-schedule-app からの INSERT 許可
-- -------------------------------------------------------------
-- schedule.html L281 で利用者がヘルパーへ通知を投げる用途。
-- SELECT/UPDATE/DELETE は Firebase Functions（service_role）でのみ
-- 行うため、ここでは INSERT のみ anon 許可。
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_anon_insert
  ON public.notifications
  FOR INSERT
  TO anon
  WITH CHECK (true);


-- -------------------------------------------------------------
-- 4. client_users: index.html L108 で参照
-- -------------------------------------------------------------
-- 操作種別（SELECT/INSERT/UPDATE/DELETE）が未確認のため、保守的に
-- FOR ALL で許可。Phase 4 で利用パターン詳細確認後に絞り込む候補。
-- ⚠️ このテーブルは SUPABASE_SCHEMA.md に未記載 → Phase 4 で文書化
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_users_anon_all
  ON public.client_users
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);


-- =============================================================
-- 適用後の自己チェック
-- =============================================================
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('schedule','helper_master','notifications','client_users')
--  ORDER BY tablename;
--
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('schedule','helper_master','notifications','client_users')
--  ORDER BY tablename, policyname;


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- DROP POLICY IF EXISTS schedule_anon_all          ON public.schedule;
-- DROP POLICY IF EXISTS helper_master_anon_select  ON public.helper_master;
-- DROP POLICY IF EXISTS notifications_anon_insert  ON public.notifications;
-- DROP POLICY IF EXISTS client_users_anon_all      ON public.client_users;
-- ALTER TABLE public.schedule       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.helper_master  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.notifications  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_users   DISABLE ROW LEVEL SECURITY;
