-- 2026-05-06: home_schedule_tasks 手動投入の重複を DB レベルで防止する partial UNIQUE INDEX
--
-- 背景:
--   GAS スクリプト `★サービス記録内容転送.gs` の `upsertToSupabase_` は
--   `Prefer: resolution=ignore-duplicates` を使っているが、テーブルに UNIQUE 制約が
--   無いため実質的に効いておらず、同じシートを再実行すると同一業務キーで別 id の
--   重複行が INSERT される事故が発生した（永沢嵩大様 2026-05-01 分が 11 時間差で
--   2 回投入された 2026-05-02→05-03 の事案）。
--
-- 対応方針:
--   schedule_id IS NULL（= GAS 経由の手動投入のみ）の範囲に限定して、
--   業務キー (service_date, start_time, end_time, user_name, helper_name, task)
--   に partial UNIQUE INDEX を張る。これで:
--     - GAS が同じ予定をもう一度送っても 23505 (unique_violation) で拒否される
--     - GAS 側の `Prefer: resolution=ignore-duplicates` が初めて真に機能し、
--       2 回目以降は静かに無視される（エラーにならない）
--     - 合同シフト（同じ利用者・時間帯で別ヘルパー）は helper_name が違うので
--       正常に共存できる
--
-- 適用前提:
--   * 既存の重複行が schedule_id IS NULL の範囲で 0 件であること（重複が残っていると
--     INDEX 作成自体が失敗する）。2026-05-06 時点で全期間で 0 件を確認済み。
--
-- ロールバック:
--   DROP INDEX IF EXISTS public.uniq_home_schedule_tasks_manual;
--
-- 影響アプリ:
--   - village-tsubasa: 影響なし（同テーブルは UPDATE のみ）
--   - village-admin: 影響なし（同テーブルは SELECT のみ）
--   - GAS `village-schedule-sync/★サービス記録内容転送.gs`: 既存の
--     resolution=ignore-duplicates が正常動作するようになる（コード変更不要）

CREATE UNIQUE INDEX IF NOT EXISTS uniq_home_schedule_tasks_manual
ON public.home_schedule_tasks (
  service_date,
  start_time,
  end_time,
  user_name,
  helper_name,
  task
)
WHERE schedule_id IS NULL;

-- 動作確認用（本番実行後に Dashboard の SQL Editor で）:
--   1) インデックスの存在確認
--      SELECT indexname, indexdef FROM pg_indexes
--      WHERE tablename = 'home_schedule_tasks' AND indexname = 'uniq_home_schedule_tasks_manual';
--
--   2) 重複 INSERT が拒否されることを確認（任意のテストデータで）
--      INSERT INTO home_schedule_tasks (service_date, start_time, end_time, user_name, helper_name, task, status)
--      VALUES ('2099-01-01', '00:00', '01:00', 'TEST_USER', 'TEST_HELPER', 'TEST', 'unwritten');
--      INSERT INTO home_schedule_tasks (service_date, start_time, end_time, user_name, helper_name, task, status)
--      VALUES ('2099-01-01', '00:00', '01:00', 'TEST_USER', 'TEST_HELPER', 'TEST', 'unwritten');
--      -- 2 回目: ERROR: duplicate key value violates unique constraint "uniq_home_schedule_tasks_manual" を期待
--
--   3) テストデータ削除
--      DELETE FROM home_schedule_tasks WHERE user_name = 'TEST_USER';
