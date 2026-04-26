-- =============================================================
-- 2026-04-26_schedule_editor_phase_a.sql
-- =============================================================
-- 目的:
--   スプレッドシート的スケジュール編集 HTML（/schedule-editor/）の
--   Phase A（DB 列追加）。実 Supabase には 2026-04-26 に既に適用済みで、
--   このファイルは将来の再現・別環境への展開用の正本。
--
-- 対象:
--   - schedule        : 論理削除フラグ列を追加
--   - admin_users     : 編集権限フラグ列を追加
--
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼って Run。
--   IF NOT EXISTS / IF EXISTS 付きなので冪等。
--
-- ロールバック:
--   末尾の ROLLBACK ブロックを参照（コメントアウト解除して実行）
--
-- 関連:
--   docs/CHANGELOG.md 2026-04-26 エントリ
--   docs/SUPABASE_SCHEMA.md §1 (schedule) / §9 (admin_users)
-- =============================================================


-- -------------------------------------------------------------
-- 1. schedule に論理削除フラグを追加
-- -------------------------------------------------------------
-- /schedule-editor/ から削除した予定はここに削除日時が入る。
-- 一覧クエリは WHERE deleted_at IS NULL で絞ることで論理削除を実現。
-- ゴミ箱画面（Phase D 予定）から復元できる設計。

ALTER TABLE public.schedule
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_deleted_at
  ON public.schedule(deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.schedule.deleted_at
  IS '論理削除フラグ（NULL=有効、値あり=削除済み）。schedule-editor から削除した予定はここに削除日時が入り、ゴミ箱画面から復元可能';


-- -------------------------------------------------------------
-- 2. admin_users に編集権限フラグを追加
-- -------------------------------------------------------------
-- 既存の admin_users は「ダッシュボード閲覧 allow-list」用で、
-- /schedule-editor/ の編集権限はその中でさらに絞り込む必要があるため
-- 新列を追加。デフォルト false（誰も編集できない安全側）。

ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS can_edit_schedule BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_users.can_edit_schedule
  IS '/schedule-editor/ で編集できるか。true の人だけ編集モード、false は閲覧のみ';


-- -------------------------------------------------------------
-- 3. 編集権限を持たせる人の登録（参考、本番環境では実行済み）
-- -------------------------------------------------------------
-- 別環境で再現する場合のみ、以下の WHERE のメールアドレスを実態に合わせて
-- 編集してから実行する。本番には 2026-04-26 に既に適用済み。

-- INSERT INTO public.admin_users (email, can_edit_schedule)
-- SELECT v.email, true
-- FROM (VALUES
--   ('編集者1@example.com'),
--   ('編集者2@example.com'),
--   ('編集者3@example.com')
-- ) AS v(email)
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.admin_users a WHERE a.email = v.email
-- );
--
-- UPDATE public.admin_users
-- SET can_edit_schedule = true
-- WHERE email IN ('既存編集者@example.com');


-- =============================================================
-- 適用後の自己チェック
-- =============================================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('schedule','admin_users')
--   AND column_name IN ('deleted_at','can_edit_schedule');
--
-- SELECT email, can_edit_schedule FROM public.admin_users
-- ORDER BY can_edit_schedule DESC, email;


-- =============================================================
-- ROLLBACK（必要時にコメントアウトを外して実行）
-- =============================================================
-- ALTER TABLE public.admin_users DROP COLUMN IF EXISTS can_edit_schedule;
-- DROP INDEX IF EXISTS public.idx_schedule_deleted_at;
-- ALTER TABLE public.schedule    DROP COLUMN IF EXISTS deleted_at;
