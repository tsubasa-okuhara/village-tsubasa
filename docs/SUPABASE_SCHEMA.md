# Supabase スキーマ (village-tsubasa)
本ファイルは village-tsubasa プロジェクトで使っている Supabase のテーブル・ビューを一覧化したものです。
各テーブルの役割、主要列、関連 API/画面、参考ファイルをまとめています。
> **凡例**
> - ✅ : リポジトリ内に CREATE 文（sql/）あり
> - ⚠️ : コード参照のみ（CREATE 文がリポジトリに無い、Supabase 上で直接作成されたもの）
> - 🔎 : 要確認（別チャットで追加された可能性あり）
---
## 1. schedule 系
### ⚠️ `schedule`
- **役割**: 利用者の予定データ本体。利用者アプリ・ヘルパーアプリ・スプレッドシート同期の中心テーブル
- **列**:
  - `id` (uuid): PK
  - `date` (date): 予定日
  - `name` (text): ヘルパー名
  - `helper_email` (text): ヘルパーメール（`schedule_web_v` VIEW 経由で参照）
  - `client` (text): 利用者名
  - `start_time` (time): 開始時間
  - `end_time` (time): 終了時間
  - `haisha` (text): 配車
  - `task` (text): サービス種類（居宅 / 移動 / 家事 / 通院）
  - `summary` (text): 概要
  - `beneficiary_number` (text): 受給者証番号
  - `source_key` (text): 元データキー（スプレッドシート側との同期キー）
  - `synced_to_sheet` (boolean, default false): スプレッドシートに反映済みか（2026-04-17 追加）。毎月 15 日の GAS トリガーが `false` の行を対象にまとめて流し込む設計
  - `synced_at` (timestamptz, nullable): シート書き込み完了時刻（2026-04-17 追加）。現状 GAS 側で更新していない（シート内の supabaseId 列で同期状態を判定する「シート状態ベース版」に切り替えたため、このカラムはデフォルト値のまま残る）
  - `deleted_at` (timestamptz, nullable, default null): 論理削除フラグ（2026-04-26 追加）。`/schedule-editor/` から削除した予定はここに削除日時が入り、ゴミ箱画面から復元可能。一覧クエリは `WHERE deleted_at IS NULL` で絞る想定。partial index `idx_schedule_deleted_at` も追加済み
  - `created_at` / `updated_at` (timestamptz)
- **制約**: pk = `id`。その他の unique/fk は未確認
- **参照箇所**:
  - 利用者アプリ (`tsubasa-okuhara/user-schedule-app`):
    - `schedule.html` の `loadSchedule` / `doAdd` / `doEdit` / `doCancel` / `doSubmit` （INSERT / UPDATE / DELETE / SELECT）
  - village-tsubasa (本リポジトリ):
    - `functions/src/scheduleSync.ts` （件数カウント）
    - `functions/src/scheduleAll.ts`
    - `schedule_web_v` view の元テーブル
  - GAS 「【ビレッジつばさ】全体スケジュール」 → `★supabase転送本体.gs` でスプレッドシート ⇄ Supabase 双方向同期
  - GAS 「スケジュール逆同期」 プロジェクト:
    - `doPost` / `doGet` （利用者アプリ → スプレッドシート即時反映、`handleAdd` / `handleEdit` / `handleDelete`）
    - `monthlySheetAutoCreate_` （2026-04-17 追加、毎月 15 日 00:05 自動起動）：翌月の週シート生成 + Supabase の対象月予定を一括流し込み
    - `flushScheduleToSheet_(year, month)`：指定年月の Supabase 予定を引いて、シートに無い分だけ `handleAdd` で書き込み（重複防止は `findRowByIdOrKey_` で判定）
- **備考**:
  - CREATE 文はリポジトリに無い（Supabase 直作成の可能性が高い）
  - `.insert(...).select('id')` が RLS の影響で `data: null` を返すことを確認済み。anon ロールに INSERT 後の SELECT 権限が無い可能性あり（利用者アプリで発生）
  - 2026-04-17 時点で 1,838 レコード（service_role 経由のカウント）
  - スプレッドシート側は Supabase `id` を **W 列相当**（block 開始列からの offset 19）に保持して同期キーにしている
    - 2026-04-17 変更: Q 列（offset 13）→ W 列（offset 19）に移動。`gas/コード.gs` の `COL.SUPABASE_ID` 定数で管理
  - RLS は OFF（2026-04-17 確認）。service_role キーは GAS のスクリプトプロパティ `SUPABASE_SERVICE_KEY` に保存
  - ⚠️ 過去に GAS スクリプトプロパティが別プロジェクト (`xwnbdlcukycihgfrfcox`) の anon キーを指していた事故あり。現在は `pbqqqwwgswniuomjlhsh` の service_role キーに修正済み（2026-04-17）
### ✅ `schedule_web_v` （ビュー）
- **役割**: Web アプリ表示用に `schedule` を整形した view
- **参考**: `sql/2026-03-29_create_schedule_web_v.sql`
- **主な処理**:
  - 担当者未設定を「担当未設定」に置換
  - `helper_email` が空のときは `helper_master` から補完
  - `start_time` / `end_time` / `client` / `task` などの空白文字列を null 化
  - `summary` が「概要なし」「—」「-」の場合は null 化
- **参照箇所**:
  - `functions/src/scheduleList.ts` （月間一覧）
  - `functions/src/todaySchedule.ts` （当日予定）
  - `functions/src/tomorrowSchedule.ts` （翌日予定）
  - `functions/src/helperSummary.ts`
  - `functions/src/nextHelperSchedule.ts`
  - `functions/src/scheduledNotifications.ts`
### ✅ `helper_master`
- **役割**: ヘルパー名・メールアドレス + 資格・運転可否のマスタ
- **参考**: `sql/2026-03-29_create_helper_master.sql` + `sql/2026-04-29_helper_compatibility.sql`（資格列追加）
- **列**:
  - `helper_name` (pk): `schedule.name` と一致させるヘルパー表示名
  - `helper_email`: 通知・予定紐付け用メール
  - `qualification` (text, nullable): ヘルパーの主資格名（テキスト）。実値の例: `'介護福祉士'` / `'初任者研修'` / `'重度訪問介護'`。**資格レベルの優先順位は 介護福祉士 > 初任者研修 > 重度訪問介護**
  - `can_drive` (bool, default false): 車の運転可否（2026-04-29 追加）
  - `license_juuhou` (bool, default false): 重度訪問介護 修了
  - `license_koudou` (bool, default false): 行動援護 修了
  - `license_kyotaku` (bool, default false): 居宅介護 修了
  - `license_idou` (bool, default false): 移動支援 修了
  - `capabilities_updated_at` (timestamptz, nullable): 本人が最後に資格・運転可否を更新した日時
- **使われ方**:
  - `schedule_web_v` の join で補完に使われる
  - ヘルパーセルフマッチング用に `license_*` 列が利用される（Phase 1A 開発中、`user_helper_compatibility` と組み合わせ）
  - 居宅実績記録票の HTML 表示で `qualification` の値による色分けに使う想定（介護福祉士・初任者研修=青、重度訪問介護=赤）
---
## 2. 移動支援（move）系
### ⚠️ `schedule_tasks_move`
- **役割**: 移動支援の予定タスク（未記入 / 記入済みを管理）
- **列**（village-admin / village-tsubasa 両方から読み取り）:
  - `id` (uuid): PK
  - `beneficiary_number` (text): 受給者証番号
  - `user_name` (text): 利用者名
  - `helper_name` (text): ヘルパー名
  - `helper_email` (text)
  - `service_date` (date): サービス実施日 ← **正規の列名**
  - `status` (text): `'unwritten'` | `'written'`
  - `start_time` (text / time), `end_time` (text / time)
  - `task` (text): サービス区分
  - `summary` (text)
  - `summary_text` (text)
  - `haisha` (text): 配車
  - `updated_at` (timestamptz)
- **参照箇所**:
  - village-tsubasa:
    - `functions/src/service-records-move/listUnwritten.ts` （`status='unwritten'` を取得）
    - `functions/src/service-records-move/saveRecord.ts` （保存時に `status='written'` へ更新）
    - `functions/src/services/moveCheckService.ts` （`fetchMoveCheckUnwrittenTasks`）
  - village-admin (別リポジトリ):
    - `functions/src/dashboard/summary.ts:39` （`status='unwritten'` カウント）
    - `functions/src/dashboard/summary.ts:95` （`handleUnwrittenByHelper`）
    - `functions/src/dashboard/search.ts:48` （横断検索）
- **⚠️ バグ疑い**:
  - `functions/src/services/moveCheckService.ts:52` で `.order("date", { ascending: true })` となっているが、村上翼さんの調査で正規の列名は `service_date` と確認済み。`date` 列は存在しない可能性が高く、**バグの疑いあり**。デプロイ前に要修正 🔎
- **備考**: CREATE 文はリポジトリに無い
### ⚠️ `service_notes_move`
- **役割**: 移動支援の完成サービス記録。村上さんの管理ダッシュボードから Excel 出力する際の元データにもなる
- **列**:
  - `id` (uuid): PK
  - `schedule_task_id` (text): `schedule_tasks_move.id` と紐付け
  - `beneficiary_number` (text): 受給者証番号
  - `helper_email`, `helper_name`, `user_name`
  - `service_date` (date), `start_time` (time), `end_time` (time)
  - `task` (text): サービス区分
  - `haisha` (text): 配車 / 行き先
  - `notes` (text): ヘルパー入力の生メモ
  - `summary_text` (text): AI 生成サマリ
  - `sent_at` (timestamptz, nullable): **一斉送信日時**。村上さんの管理ダッシュボードから一斉送信する際、`sent_at IS NULL` を条件に UPDATE して再送を防ぐ
- **参照箇所**:
  - village-tsubasa: `functions/src/service-records-move/saveRecord.ts` （INSERT）
  - village-admin:
    - `functions/src/dashboard/export-move.ts:18` （Excel 出力）
    - `functions/src/dashboard/search.ts:83` （検索）
    - `functions/src/dashboard/summary.ts:47` （記録済み件数カウント）
    - `functions/src/dashboard/service-notes.ts` （一覧取得 + `sent_at` UPDATE）
- **備考**:
  - Excel 生成は `excel-move.ts` で 2 件 / ページの A4 縦レイアウト
  - CREATE 文はリポジトリに無い
### ⚠️ `move_check_logs`
- **役割**: 移動支援のチェックポイント通過ログ（位置情報付き）。おそらく送迎の出発・到着・引き返しなどを記録するための用途
- **列**（`MoveCheckLogRow` 型より）:
  - `id` (uuid): PK
  - `schedule_task_id` (text): `schedule_tasks_move.id` と紐付け
  - `checkpoint_type` (text): チェックポイント種別
  - `checkpoint_label` (text): チェックポイント表示名
  - `checked_at` (text / timestamp): チェック時刻
  - `latitude` (numeric), `longitude` (numeric), `accuracy` (numeric): 位置情報
  - `helper_email` (text)
  - `created_at` (timestamptz)
- **参照箇所**:
  - `functions/src/services/moveCheckService.ts`
    - `fetchMoveCheckLogs` （`schedule_task_id` で絞り込み、`checked_at` 昇順）
    - `createMoveCheckLog` （insert）
- **備考**: CREATE 文はリポジトリに無い
---
## 3. 居宅介護（home）系
### ⚠️ `home_schedule_tasks`
- **役割**: 居宅介護（home）の予定タスク（move と同じ責務の home 版）
- **列**:
  - `id` (uuid): PK
  - `schedule_id` (text): 元の `schedule` テーブルとの紐付け用
  - `beneficiary_number` (text): 受給者証番号
  - `user_name` (text): 利用者名
  - `helper_name` (text), `helper_email` (text)
  - `service_date` (date): サービス実施日
  - `start_time` (text / time), `end_time` (text / time)
  - `task` (text): サービス種類
  - `summary` (text)
  - `status` (text): `'unwritten'` | `'written'`
- **参照箇所**:
  - village-tsubasa:
    - `functions/src/service-records-home/listUnwritten.ts` （`status='unwritten'` を取得、helper_email で絞り込み可）
    - `functions/src/service-records-home/saveRecord.ts` （保存時に `status='written'` へ更新）
  - village-admin:
    - `functions/src/dashboard/summary.ts:43` （未記録件数カウント）
    - `functions/src/dashboard/summary.ts:95` （ヘルパー別集計）
    - `functions/src/dashboard/search.ts:59` （横断検索）
- **備考**:
  - テーブル名の prefix/suffix が `schedule_tasks_move` と非対称 (`schedule_tasks_move` vs `home_schedule_tasks`)。将来統一する場合は要注意
  - CREATE 文はリポジトリに無い
### ⚠️ `service_notes_home`
- **役割**: 居宅介護の完成サービス記録（Excel 出力の元データ）
- **列**:
  - `id` (uuid): PK
  - `schedule_task_id` (text): `home_schedule_tasks.id` と紐付け
  - `beneficiary_number` (text): 受給者証番号
  - `helper_name` (text), `helper_email` (text, nullable)
  - `user_name` (text)
  - `service_date` (date)
  - `task` (text, nullable): サービス区分（身体介護 / 家事援助 等）
  - `memo` (text, nullable): **独自のフリーテキスト構造フォーマット**（`区分: / 主チェック: / 子チェック: / 補足:`）でヘルパー入力の生メモを保持
  - `ai_summary` (text, nullable): AI 生成サマリ
  - `final_note` (text): **最終的に送信するメモ**。冒頭に `YYYY-MM-DD HH:MM:SS〜HH:MM:SS` 形式の時間帯が埋め込まれている前提
  - `sent_at` (timestamptz, nullable): 一斉送信日時。`sent_at IS NULL` で再送防止
  - `created_at`, `updated_at` （CSV サンプルで確認、admin コードでは未参照）
- **参照箇所**:
  - village-tsubasa: `functions/src/service-records-home/saveRecord.ts` （INSERT）
  - village-admin:
    - `functions/src/dashboard/export-home.ts:18` （Excel 出力）
    - `functions/src/dashboard/search.ts:94` （検索）
    - `functions/src/dashboard/summary.ts:50` （記録済み件数カウント）
    - `functions/src/dashboard/service-notes.ts` （一覧取得 + `sent_at` UPDATE）
    - `functions/src/dashboard/excel-home.ts` （`memo` のパーサー `parseMemo` と `final_note` からの時間抽出 `parseTimeFromFinalNote`）
- **備考 / クセ**:
  - `service_notes_move` と違って **`start_time` / `end_time` 列を持たない**。時間は `final_note` の冒頭から正規表現で抽出する仕様
  - `memo` の独自フォーマットに admin 側の `parseMemo` が依存しているため、保存時の形式を変更するとダッシュボードが壊れる
  - CREATE 文はリポジトリに無い
### ⚠️ `service_action_logs_home`
- **役割**: 居宅介護の構造化アクションログ（1つの `service_notes_home` に 0〜1 件紐付く想定）
- **列**（`ServiceActionLogHomeInsertRow` 型より）:
  - `id` (uuid): PK
  - `service_note_id` (text): `service_notes_home.id` への参照
  - `schedule_task_id` (text): `home_schedule_tasks.id` への参照
  - `action_type` (text, nullable)
  - `action_detail` (text, nullable)
  - `actor` (text): 現状コードでは `'helper'` 固定
  - `target` (text): 利用者名を格納
  - `assist_level` (text, nullable)
  - `physical_state` (text, nullable)
  - `mental_state` (text, nullable)
  - `risk_flag` (text, nullable)
  - `action_result` (text, nullable)
  - `difficulty` (text, nullable)
- **参照箇所**: `functions/src/service-records-home/saveRecord.ts`
- **備考**:
  - CREATE 文はリポジトリに無い
  - move 側の `service_record_structured` / `service_action_logs` が親子分離して汎用化されているのに対し、home 側は `service_notes_home` と 1:1 想定の独立テーブルになっている。設計方針の違いあり
---
## 4. 構造化記録（service-records-structured）系
### ✅ `service_record_structured`
- **役割**: 移動/居宅の支援内容を構造化した記録の親テーブル
- **参考**: `sql/service_records_structured_move_mvp.sql`
- **列**:
  - `id` (uuid pk)
  - `source_type`, `source_note_id` (一意制約)
  - `schedule_task_id`, `helper_email`, `helper_name`, `user_name`
  - `service_date`, `start_time`, `end_time`
  - `location`, `location_note`, `time_of_day`
  - `temperature` (numeric)
  - `physical_state`, `mental_state`
  - `risk_flags` (jsonb, GIN index)
  - `action_result`, `difficulty`, `assist_level`
  - `created_at`, `updated_at`
- **参照箇所**:
  - `functions/src/service-records-structured/save.ts`
  - `functions/src/service-records-structured/list.ts`
  - `functions/src/service-records-structured/detail.ts`
  - `functions/src/service-records-structured/getRecord.ts`
### ✅ `service_action_logs`
- **役割**: 構造化記録に紐づく支援アクションログ（親 1 : 子 多）
- **参考**: `sql/service_records_structured_move_mvp.sql`
- **列**:
  - `id` (uuid pk)
  - `structured_record_id` (fk → service_record_structured.id, cascade delete)
  - `action_type`, `action_detail`, `action_detail_other`
  - `actor`, `target`
  - `start_time`, `end_time`, `duration` (分)
  - `action_result`, `difficulty`, `assist_level`
  - `created_at`
### ✅ `service_irregular_events`
- **役割**: 構造化記録に紐づくイレギュラー事象
- **参考**: `sql/service_records_structured_move_mvp.sql`
- **列**:
  - `id` (uuid pk)
  - `structured_record_id` (fk, cascade delete)
  - `event_type`, `before_state`, `after_action`
  - `created_at`
---
## 5. 通知・プッシュ系
### ✅ `notifications`
- **役割**: helper_email 単位のアプリ内通知
- **参考**: `sql/notifications.sql`
- **列**:
  - `id` (uuid pk)
  - `target_email`: helper_email と一致する通知対象
  - `title`, `body`, `link_url`
  - `notification_type`: `today` / `tomorrow` / `admin` などの種別
  - `is_read` (boolean)
  - `created_at`
- **参照箇所**:
  - `functions/src/notifications.ts`
  - `functions/src/push.ts`
  - `functions/src/scheduledNotifications.ts`
### ✅ `push_subscriptions`
- **役割**: helper_email と端末 Push 購読情報の紐付け
- **参考**: `sql/push_subscriptions.sql`
- **列**:
  - `id` (uuid pk)
  - `helper_email`
  - `endpoint` (unique)
  - `p256dh_key`, `auth_key`
  - `user_agent`
  - `is_active` (boolean)
  - `created_at`, `updated_at`
- **参照箇所**:
  - `functions/src/push.ts`
  - `functions/src/scheduledNotifications.ts`
---
## 6. フィードバック系
### ✅ `anonymous_feedback`
- **役割**: ヘルパーからの匿名フィードバック（AI で整形後のメッセージのみ保存）
- **参考**: `sql/create_anonymous_feedback.sql`
- **列**:
  - `id` (uuid pk)
  - `category` (text, default 'general')
  - `ai_message` (text, AI で整形後のメッセージ)
  - `status` ('unread' | 'read' | 'archived')
  - `admin_reply` (text, 管理者からの返信・AI で整形後)
  - `created_at`
- **重要**: 元メッセージ・送信者情報は保存しない（完全匿名）
- **参照箇所**: `functions/src/feedback.ts`
---
## 7. 研修報告系
### ✅ `training_reports`
- **役割**: ヘルパーの研修報告 + 管理者からの研修お知らせを統合管理
- **参考**: `sql/create_training_reports.sql`
- **列**:
  - `id` (uuid): PK
  - `report_type` (text): `'helper_report'`（ヘルパー報告） / `'admin_notice'`（管理者お知らせ）
  - `training_name` (text): 研修名・テーマ
  - `training_date` (date): 実施日
  - `training_hours` (numeric): 研修時間
  - `training_format` (text): 受講形式（集合研修 / オンライン / 動画視聴 / 資料閲覧）
  - `helper_email`, `helper_name` (text, nullable): ヘルパー報告時のみ
  - `original_comment` (text, nullable): ヘルパーが入力した元の所感
  - `ai_comment` (text, nullable): AI で整形された所感
  - `admin_email` (text, nullable): 管理者お知らせ時の投稿者
  - `notice_body` (text, nullable): 管理者お知らせ本文
  - `status` (text): `'unread'` / `'read'` / `'archived'`
  - `created_at` (timestamptz)
- **参照箇所**: `functions/src/trainingReport.ts`
- **備考**: `anonymous_feedback` と違い、元のメッセージ (`original_comment`) も保存する（管理者が比較できるように）
---
## 8. 落ち着き確認（calm check）系
### ✅ `calm_check_targets`
- **役割**: 落ち着き確認の対象利用者を管理。管理者が追加・削除可能
- **CREATE 文**: `sql/create_calm_checks.sql`
- **列**:
  - `id` (uuid): PK
  - `client_id` (uuid): `clients.id` への参照
  - `client_name` (text): 表示用利用者名
  - `is_active` (boolean): アクティブフラグ（削除は論理削除）
  - `created_at` / `updated_at` (timestamptz)
- **API**: `GET /api/calm-checks/targets`, `POST /api/calm-checks/targets`, `POST /api/calm-checks/targets/remove`
- **使用場所**: `functions/src/calmCheck.ts` (handleGenerateCalmChecks で対象者取得)
### ✅ `calm_checks`
- **役割**: ヘルパーの落ち着き確認回答を記録。支援後に対象利用者の様子を共有
- **CREATE 文**: `sql/create_calm_checks.sql`
- **列**:
  - `id` (uuid): PK
  - `client_id` (uuid): 利用者 ID
  - `client_name` (text): 利用者名
  - `helper_email` (text): 回答ヘルパーのメール
  - `helper_name` (text): ヘルパー名
  - `schedule_task_id` (uuid): `schedule_tasks_move.id` への参照
  - `service_date` (date): 支援日
  - `start_time` / `end_time` (text): スケジュールの開始・終了時間
  - `task_name` (text): 支援場所・内容
  - `is_calm` (boolean): 落ち着いていたか
  - `severity` (text): `null` | `'overall'` | `'partial'`（全体的/部分的）
  - `memo` (text): 自由記述メモ
  - `status` (text): `'pending'` | `'answered'` | `'skipped'`
  - `shared_to_line` (boolean): LINE 共有済みフラグ（将来用）
  - `shared_at` (timestamptz): LINE 共有日時
  - `created_at` / `answered_at` (timestamptz)
- **API**:
  - `GET /api/calm-checks/pending?helper_email=` — 未回答一覧
  - `POST /api/calm-checks/answer` — 回答送信
  - `POST /api/calm-checks/generate` — 今日のスケジュールから確認レコード生成
  - `GET /api/calm-checks/history` — 回答履歴（管理者用）
- **使用場所**: `functions/src/calmCheck.ts`, `public/calm-check/`
- **ホーム画面**: `public/index.js` で pending 件数を取得し、連絡確認カード内にアラート表示
---
## 8.5 利用者マスタ系（user-schedule-app）

### 🔎 `client_users`
- **役割（推定）**: 利用者の認証/識別マスタ。user-schedule-app のログインや
  本人特定に使われている可能性が高い
- **発見経緯**: 2026-04-25、RLS 移行 Phase 2 の調査で `~/Desktop/user-schedule-app/index.html:108` から
  `.from('client_users')` 呼び出しが発見された
- **列**: 未調査
- **参照箇所**:
  - user-schedule-app/index.html L108（操作種別未確認）
- **CREATE 文**: 不明（リポジトリ内未確認）
- **TODO**:
  - [ ] 列構成の確認（Supabase Dashboard）
  - [ ] index.html の前後コードを読んで操作種別を特定（SELECT のみ？INSERT もある？）
  - [ ] `calm_check_targets.client_id` が参照する `clients` テーブルとの関係性確認
- **RLS**: 2026-04-25 時点で OFF。Phase 3 で `FOR ALL TO anon` ポリシー予定
  （`sql/enable_rls_schedule.sql`）

---

## 8.6 未文書化テーブル（2026-04-25 発見）

以下のテーブルは Supabase に存在するが、本ドキュメントで用途が把握できていない。
RLS 移行 Phase 0 の診断 SQL で初めて存在が判明。

### 🔎 `helper_priority`
- **状態**: RLS 既に ON、ただし**「Always True」相当のゆるいポリシー付き**（2026-04-25 Security Advisor で判明）
- **発見経緯**: 2026-04-25 RLS 診断 SQL の結果
- **推定**: ヘルパー優先度マスタ？
- **TODO**: 用途・列構成・参照箇所を奥原さんに確認 → 必要なら厳格なポリシーに置換

### 🔎 `process_log`
- **状態**: RLS 既に ON、ただし**「Always True」相当のゆるいポリシー付き**（2026-04-25 Security Advisor で判明）
- **発見経緯**: 2026-04-25 RLS 診断 SQL の結果
- **推定**: 何らかの処理ログ？
- **TODO**: 用途・列構成・参照箇所を奥原さんに確認 → 必要なら厳格なポリシーに置換

### ✅ `receipts` / `receipt_categories` / `receipt_audit_log`
- **状態**: RLS 既に ON
- **用途**: Streamlit 経費精算アプリ（`v-sche-receipt.streamlit.app`）の格納先
- **参考**: `supabase_schema.sql` / `supabase_migration_*.sql`（CHANGELOG 2026-04-19）
- 本リポからは触らない（Streamlit アプリ側で管理）

---

## 9. village-admin 専用テーブル（別リポジトリ管理）
以下は `village-admin` リポジトリ側の `sql/create_admin_tables.sql` で管理されているテーブル。village-tsubasa からは参照していないが、同じ Supabase プロジェクトを共有しているため記録:
### ✅ `admin_users`
- **役割**: 管理ダッシュボードにアクセスできる管理者のメール allow-list +
  `/schedule-editor/`（村のつばさ側）の編集権限管理
- **列**:
  - `email` (text, NOT NULL, おそらく PK)
  - `created_at` (timestamptz, NOT NULL, default `now()`)
  - `can_edit_schedule` (boolean, NOT NULL, default `false`): 2026-04-26 追加。
    `/schedule-editor/` で編集できるか。`true` の人だけ編集モード、`false` は
    閲覧のみ。既存の「ダッシュボード閲覧 allow-list」と組み合わせる二段構え
- **参考**: `village-admin/sql/create_admin_tables.sql`、
  村のつばさ側の追加列は `sql/2026-04-26_schedule_editor_phase_a.sql`
- **参照箇所**:
  - `village-admin/functions/src/middleware/adminAuth.ts`（既存、ダッシュボード認証）
  - 村のつばさ `functions/src/scheduleEditor/auth.ts`（Phase C で追加予定）
### ✅ `admin_error_alerts`
- **役割**: 管理ダッシュボードのエラーアラート管理
- **参考**: `village-admin/sql/create_admin_tables.sql`
- **参照箇所**:
  - `village-admin/functions/src/error-alerts/list.ts`
  - `village-admin/functions/src/error-alerts/dismiss.ts`
---
## 10. スプレッドシート同期（GAS 「スケジュール逆同期」プロジェクト）
Supabase テーブルではないが、`schedule` テーブルの延長線上にあるので併記:

### スプレッドシートの列構造（各曜日ブロック）
ブロック開始列は曜日により異なる（月:D, 火:AA, 水:AX, 木:BU, 金:CR, 土:DO, 日:EL）。各ブロックは 22 列幅。各ブロック内の offset で以下のカラムを管理:

| offset | 役割 | COL 定数 |
|-------|------|----------|
| 0 | ヘルパー | `HELPER` |
| 1 | 利用者 | `CLIENT` |
| 2 | 開始時間 | `START` |
| 3 | 終了時間 | `END` |
| 4 | 配車 | `HAISHA` |
| 5 | 内容（サービス種類） | `TASK` |
| 6 | 概要 | `SUMMARY` |
| 7 | 日付 | `DATE` |
| 8 | 目的コード | `PURPOSE` |
| 9 | 2人付フラグ | `TWO_PERSON` |
| 10 | 請求 | `BILLING` |
| 11 | 受給者番号 | `BENEFICIARY` |
| 12 | ヘルパーメール | `HELPER_EMAIL` |
| 13〜18 | サービスコード / 単位数 / サービス内容 / (2人付) 計6列 | （GAS 未使用、シート上の手入力欄） |
| 19 | スケジュール id (Supabase uuid) | `SUPABASE_ID` ← **2026-04-17 に 13→19 へ変更** |

### GAS 関数
- `doPost` / `doGet`: 利用者アプリからの即時同期（add / edit / delete / export_records）
- `handleAdd` / `handleEdit` / `handleDelete`: 実書き込み処理。`COL.SUPABASE_ID` を経由してシート内の uuid 列を一元管理
- `findRowByIdOrKey_`: id または (client + startTime) で行特定。edit / delete / 流し込み時の重複判定に使用
- `monthlySheetAutoCreate_` （2026-04-17 追加）: 毎月 15 日 00:05 のトリガー。翌月 1 日を `基本!A2` にセット → `createCalendarsWeek1to6_FromKihonA2_MondayStart(ss)` でシート生成 → `flushScheduleToSheet_(year, month)` で Supabase の未反映分を流し込み
- `installMonthlyTrigger_`: 上記トリガーを登録する 1 回きりの手動実行関数
- `runMonthlySheetAutoCreateNow`: 緊急時の手動起動

### スクリプトプロパティ
- `SUPABASE_URL`: `https://pbqqqwwgswniuomjlhsh.supabase.co`
- `SUPABASE_SERVICE_KEY`: service_role キー（管理者権限）

---
## 11. 要確認 / TODO 🔎
### ⚠️ バグ疑い: `moveCheckService.ts` の `date` カラム参照
- `functions/src/services/moveCheckService.ts:52` で `.order("date", ...)` となっているが、`schedule_tasks_move` の正規列名は `service_date`（village-admin 側も `service_date` を使用）
- テーブルに `date` 列が存在しないなら、このクエリは実行時エラーになる
- **4/15 デプロイ前に要修正**
### CREATE 文のリポジトリ化
以下のテーブルはコード参照のみで CREATE 文が無い:
- `schedule`
- `schedule_tasks_move`
- `service_notes_move`
- `move_check_logs`
- `home_schedule_tasks`
- `service_notes_home`
- `service_action_logs_home`
村上翼さんからの提案: 次回本番反映のタイミングで Supabase ダッシュボードから実スキーマをエクスポートして `sql/` 配下に取り込む。そうすれば RLS / trigger / index の情報も追えるようになる。
### RLS（Row Level Security）設定
- **2026-04-25**: ✅ **全テーブルの RLS 移行完了**（`docs/RLS_MIGRATION_PLAN.md` 参照）
  - Phase 1: Group A 17テーブル（service_role 専用、ポリシー無し）
  - Phase 3: Group B 4テーブル（anon 全許可ポリシー、選択肢A）
    - `schedule` `FOR ALL TO anon`、`helper_master` `FOR SELECT TO anon`、
      `notifications` `FOR INSERT TO anon`、`client_users` `FOR ALL TO anon`
  - 既に RLS ON だった5テーブル（`helper_priority` / `process_log` /
    receipt_*）はそのまま
  - 全 4 アプリ（利用者・ヘルパー2画面・管理）動作確認 OK
- 過去の経緯:
  - 2026-04-17: `schedule` の RLS OFF を確認。anon INSERT 後の SELECT が
    返らない事例あり（村上翼さん確認）
  - 2026-04-24: Supabase から `rls_disabled_in_public` /
    `exposed_sensitive_data` 警告メール到来。段階移行計画を起草
  - 2026-04-25: Phase 1 初回適用時に管理ダッシュボード破損 → ロールバック →
    村のつばさ Firebase Secret に anon キーが入っていた事故を発見・修正 →
    Phase 1 / Phase 3 ともに適用成功
### `service_notes_home` の独自フォーマット依存
- `memo` と `final_note` に独自フォーマットが埋め込まれていて、village-admin 側の `parseMemo` / `parseTimeFromFinalNote` が依存している
- village-tsubasa 側で保存形式を変更する場合は、村上さんの admin ダッシュボードが壊れるので事前共有が必要
### `synced_to_sheet` / `synced_at` が未使用状態
- 2026-04-17 にカラムを追加したが、PostgREST キャッシュ問題で GAS から書き込みできなかった経緯から、現在の `sheet_auto_create.gs` は「シート状態ベース版」（シートに同じ supabaseId があるかで判定）に切り替え済み
- カラム自体は残してあるので、将来必要になれば GAS 側で `sbMarkSynced_()` を有効化すれば使える
---
## 更新履歴
- 2026-04-11: 初版作成
- 2026-04-11: `schedule` テーブルの列定義・参照箇所・RLS 上の注意点を追記（村上翼 / village-admin チャットからの情報反映）
- 2026-04-11: move / home 系（`schedule_tasks_move`, `service_notes_move`, `move_check_logs`, `home_schedule_tasks`, `service_notes_home`, `service_action_logs_home`）を `functions/src/` から読み取って詳細化
- 2026-04-11: village-admin 調査結果を反映。`sent_at`、`memo` / `final_note` の独自フォーマット、`schedule_tasks_move` のバグ疑い、`admin_users` / `admin_error_alerts` テーブルを追記
- 2026-04-13: `training_reports` テーブル追加（研修報告 + 管理者お知らせ統合）。CREATE 文は `sql/create_training_reports.sql`
- 2026-04-14: `calm_check_targets` / `calm_checks` テーブル追加（落ち着き確認システム）。CREATE 文は `sql/create_calm_checks.sql`
- 2026-04-17: `schedule` テーブルに `synced_to_sheet` (boolean) / `synced_at` (timestamptz) を追加。スプレッドシートの `SUPABASE_ID` 列位置を Q列（offset 13）→ W列（offset 19）に変更。GAS 「スケジュール逆同期」に月次自動化（`monthlySheetAutoCreate_` / `flushScheduleToSheet_` / `installMonthlyTrigger_`）を追加。毎月 15 日 00:05 に翌月シート自動生成 + Supabase 未反映分の流し込みを実行。`sheet_auto_create.gs` は「シート状態ベース版」で実装。GAS スクリプトプロパティの SUPABASE_URL が別プロジェクトを指していた事故を修正し、正しい service_role キーに更新
- 2026-04-24: RLS 段階移行計画を `docs/RLS_MIGRATION_PLAN.md` に起草。診断 SQL (`sql/check_rls_status.sql`)、Phase 1 適用 SQL (`sql/enable_rls_group_a.sql`、23 テーブル対象)、Phase 3 雛形 SQL (`sql/enable_rls_schedule.sql`、選択肢A/B を併記した DRAFT) を追加。Supabase への適用は未実施
- 2026-04-25: RLS 移行 Phase 2 完了。user-schedule-app の4 HTML を grep して anon アクセスパターン確定。`notifications` を Group A → B に変更（`schedule.html` から anon INSERT されるため）。`client_users` テーブルを発見し §8.5 に追加（user-schedule-app/index.html L108 で参照、CREATE 文・列構成は未調査）。`sql/enable_rls_schedule.sql` を選択肢A 確定版に書き換え（`schedule` / `helper_master` / `notifications` / `client_users` の4テーブル対象）。Supabase への適用は未実施
- 2026-04-25: RLS 移行 Phase 0（診断）実行。Supabase の public スキーマに **27 オブジェクト**（テーブル26 + ビュー1）存在を確認。RLS ON は5個（`helper_priority` / `process_log` / `receipts` / `receipt_categories` / `receipt_audit_log`）、OFF は22個。新発見テーブル `helper_priority` / `process_log` を §8.6 に追記（用途未確認）。`contracts` 5テーブルは Supabase 未作成（`sql/create_contracts.sql` 未適用）であることが判明 — Phase 1 SQL は `IF EXISTS` で防御的に対応
- 2026-04-25 夜: ✅ **RLS 移行 全フェーズ完了**。`sql/enable_rls_group_a.sql`（Phase 1、17 テーブル）と `sql/enable_rls_schedule.sql`（Phase 3、4 テーブル＋4 ポリシー）を Supabase で適用。途中で village-admin の Firebase Secret に anon キーが入っていた事故を発見・修正（同 CHANGELOG 参照）。全 4 アプリ動作確認 OK
- 2026-04-25 夜: Security Advisor クリーンアップ。`schedule_web_v` を `security_invoker = true` に変更（Errors 1→0）、public スキーマの5関数に `SET search_path = pg_catalog, public, pg_temp` 設定（Function Search Path Mutable 警告解消、Warnings 11→6）。残った6警告は Phase 3 の意図的な FOR ALL ポリシーや Firebase Auth 利用のため無関係なものだけで、実質的に追加対応不要
