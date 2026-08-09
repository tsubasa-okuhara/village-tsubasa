-- =============================================================================
-- sub2 (gmellfgcyypfrtjxblla) : service_records_* に memo / notes を追加
-- 2026-08-02
--
-- 【なぜ ALTER してよいか】
--   sub2 の DDL 制約（ALTER / DROP / TRUNCATE / DELETE 禁止）は
--   「他者が構築した既存テーブル」が対象。
--   service_records_home / service_records_move は 2026-08-02 に本プロジェクトで
--   新規作成したテーブルなので自分たちの管理下にある。
--   追加するのは nullable 列のみで、既存クエリを壊さない
--   （RULES.md ルール2「追加は nullable / 削除は禁止」に準拠）。
--
-- 【なぜ必要か】
--   memo  : village-admin の parseMemo が
--           「区分: / 主チェック: / 子チェック: / 補足:」形式に依存している
--           （RULES.md ルール7）。記録画面が buildMemoText() で組み立てて送っており
--           （public/service-records-home/main.js:1013,1470）、捨てると管理画面が壊れる。
--   notes : 移動支援の記録画面がメモを必須入力として送っている
--           （public/service-records-move/main.js:389,496）。
--
-- 【IF NOT EXISTS を使わない理由】
--   既に列がある場合はエラーで気づきたいため（sub2 運用ルール）。
--   エラーになったら「既に追加済み」なので、そのまま何もせず終了してよい。
-- =============================================================================

ALTER TABLE service_records_home ADD COLUMN memo text;

ALTER TABLE service_records_move ADD COLUMN notes text;
