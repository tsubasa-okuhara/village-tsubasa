# HANDOFF MOVE

## 1. 実装範囲

### フロント
- `public/service-records-move/index.html`
- `public/service-records-move/main.js`
- `public/service-records-move/style.css`

### Functions
- `functions/src/service-records-move/routes.ts`
- `functions/src/service-records-move/listUnwritten.ts`
- `functions/src/service-records-move/generateSummary.ts`
- `functions/src/service-records-move/saveRecord.ts`

## 2. move の役割

- `schedule_tasks_move` の未記入予定を取得する
- 予定を1件選択する
- 記録本文を入力する
- 記録案を生成する
- `service_notes_move` に保存する
- 対象予定の `status` を `written` に更新する

## 3. API 一覧

mount 定義:
- `functions/src/index.ts:20`
- `functions/src/index.ts:21`

route 定義:
- `functions/src/service-records-move/routes.ts:9-11`

### `GET /service-records-move/unwritten`
### `GET /api/service-records-move/unwritten`
- handler: `functions/src/service-records-move/listUnwritten.ts:69-129`
- 必須 query:
  - `helper_email`
- DB:
  - `schedule_tasks_move`
- 条件:
  - `helper_email = helper_email`
  - `status = unwritten`
- 並び順:
  - `date ASC`
  - `start_time ASC`

### `POST /service-records-move/summary`
### `POST /api/service-records-move/summary`
- handler: `functions/src/service-records-move/generateSummary.ts:50-83`
- 送信項目:
  - `helperName`
  - `userName`
  - `serviceDate`
  - `startTime`
  - `endTime`
  - `task`
  - `notes`
- 実装内容:
  - テンプレート文字列生成のみ
  - OpenAI 連携は未実装

### `POST /service-records-move/save`
### `POST /api/service-records-move/save`
- handler: `functions/src/service-records-move/saveRecord.ts:38-123`
- 必須 body:
  - `taskId`
  - `helperEmail`
  - `notes`
  - `summaryText`
- DB:
  - insert: `service_notes_move`
  - update: `schedule_tasks_move`

## 4. 使用テーブル

### `schedule_tasks_move`
- 一覧取得: `functions/src/service-records-move/listUnwritten.ts:97-103`
- status 更新: `functions/src/service-records-move/saveRecord.ts:88-97`

参照 / 更新しているカラム:
- `id`
- `helper_email`
- `status`
- `date`
- `start_time`
- `end_time`
- `user_name`
- `helper_name`
- `haisha`
- `task`
- `summary`
- `updated_at`

### `service_notes_move`
- insert: `functions/src/service-records-move/saveRecord.ts:67-82`

insert payload 上のカラム:
- `schedule_task_move_id`
- `helper_email`
- `helper_name`
- `user_name`
- `service_date`
- `start_time`
- `end_time`
- `task`
- `haisha`
- `notes`
- `summary_text`
- `created_at`

## 5. フロント構成

### 画面構成
- 1カラムではなく左右2パネル構成
- 左:
  - `helper_email` 入力
  - 未記入予定一覧
- 右:
  - 選択中予定の詳細
  - `notes` 入力
  - 記録案生成
  - 保存
  - `summaryText` 編集

### `main.js` の責務
- endpoint 管理: `public/service-records-move/main.js:1-5`
- state 管理: `public/service-records-move/main.js:7-11`
- 一覧 UI 描画: `public/service-records-move/main.js:72-118`
- 選択中詳細 UI 描画: `public/service-records-move/main.js:120-149`
- 未記入取得: `public/service-records-move/main.js:151-161`
- 記録案生成: `public/service-records-move/main.js:163-219`
- 保存: `public/service-records-move/main.js:221-296`
- submit / click イベント接続: `public/service-records-move/main.js:298-339`

### UI 状態
- 未記入一覧取得は実装済み
- 予定選択は実装済み
- 記録本文入力は実装済み
- 記録案生成は実装済み
- 保存 API 呼び出しは実装済み
- 保存後の一覧再取得は実装済み

## 6. 保存フロー

### 1. 未記入取得
- 起点: `public/service-records-move/main.js:298-336`
- API: `GET /api/service-records-move/unwritten`
- 条件:
  - `helper_email` 必須
  - `status = unwritten`

### 2. 選択
- 起点: `public/service-records-move/main.js:103-117`
- 一覧カードの `data-task-id` を使って `state.selectedTask` を更新

### 3. 入力
- `notes`: `public/service-records-move/index.html:68-78`
- `summaryText`: `public/service-records-move/index.html:89-98`

### 4. 記録案生成
- 起点: `public/service-records-move/main.js:163-219`
- API: `POST /api/service-records-move/summary`
- 生成方式:
  - `functions/src/service-records-move/generateSummary.ts:34-48`
  - テンプレート文のみ

### 5. 保存
- 起点: `public/service-records-move/main.js:221-296`
- API: `POST /api/service-records-move/save`
- DB insert:
  - `service_notes_move`

### 6. status 更新
- DB update:
  - `schedule_tasks_move.status = written`
- 条件:
  - `id = taskId`
  - `helper_email = helperEmail`
  - `status = unwritten`
- 更新結果が 0 件なら 409

## 7. 現時点の問題

### 保存カラム未確定
- `functions/src/service-records-move/saveRecord.ts:66`
- コメントで `service_notes_move の実カラム名に合わせて調整` と明記されている
- 現状の insert payload が本番テーブル定義と一致する保証がない

### transaction がない
- insert と status update が別クエリ
- `functions/src/service-records-move/saveRecord.ts:82`, `88-97`
- 途中失敗時に片側だけ成功する余地がある

### summary 生成は AI 連携ではない
- `functions/src/service-records-move/generateSummary.ts:65-66`
- 文面はテンプレート固定

## 8. 並行開発で守る分離ルール

- `move` の route prefix は `/service-records-move` と `/api/service-records-move` に固定
- `move` の保存先テーブルは `service_notes_move`
- `move` の予定元 / status 更新先は `schedule_tasks_move`
- `home` 実装追加時に `move` の table 名や route 名を共用しない

## 9. 次タスク

### 最優先
- `service_notes_move` の実カラム定義に合わせて `saveRecord.ts` を修正
- 保存 API の insert 成功 / status 更新成功を実データで確認

### 次点
- status 値 `unwritten` / `written` の運用を固定
- 409 応答時のフロント表示を運用文言に寄せる

### その次
- insert と update の整合性確保方法を決める
- summary 生成をテンプレートのまま使うか別実装に差し替えるか決める
