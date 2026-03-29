# PROJECT STATUS

## 1. 対象範囲の現状

### move
- フロントあり: `public/service-records-move/index.html`, `public/service-records-move/main.js`, `public/service-records-move/style.css`
- Functions あり: `functions/src/service-records-move/`
- 目的:
  - `schedule_tasks_move` から未記入予定を取得
  - 1件選択
  - 記録本文を入力
  - 記録案を生成
  - `service_notes_move` へ保存
  - 対象予定の `status` を `written` に更新

### home
- フロントはプレースホルダーのみ: `public/service-records-home/index.html`
- `public/service-records-home/main.js` は 0 byte
- `public/service-records-home/style.css` は 0 byte
- `functions/src/service-records-home/` は存在しない
- 目的を示す実装コードは未存在

### schedule
- フロントあり: `public/schedule-sync/index.html`, `public/schedule-sync/main.js`
- Functions あり: `functions/src/scheduleList.ts`, `functions/src/scheduleSync.ts`, `functions/src/todaySchedule.ts`
- 目的:
  - 月間予定一覧表示
  - 当日予定表示
  - schedule sync API の入口提供

## 2. ディレクトリ実体

### 存在するディレクトリ / ファイル
- `public/service-records-move/`
- `public/service-records-home/`
- `public/schedule-sync/`
- `functions/src/service-records-move/`
- `functions/src/scheduleList.ts`
- `functions/src/scheduleSync.ts`
- `functions/src/todaySchedule.ts`

### 存在しないディレクトリ
- `functions/src/service-records-home/`

## 3. 使用テーブル一覧

### move で実際に参照されているテーブル
- `schedule_tasks_move`
  - 参照: `functions/src/service-records-move/listUnwritten.ts:97-103`
  - 更新: `functions/src/service-records-move/saveRecord.ts:88-97`
- `service_notes_move`
  - 追加: `functions/src/service-records-move/saveRecord.ts:82`

### schedule で実際に参照されているテーブル
- `schedule`
  - 月間一覧: `functions/src/scheduleList.ts:68-74`
  - 当日一覧: `functions/src/todaySchedule.ts:58-63`
  - sync count: `functions/src/scheduleSync.ts:33-35`

### home について
- `home_schedule_tasks` は対象コード範囲内に参照なし
- `service_notes_home` は対象コード範囲内に参照なし
- `schedule_tasks_home` は対象コード範囲内に参照なし

## 4. API 一覧

API 集約定義: `functions/src/index.ts:14-21`

### schedule 系
- `GET /schedule-list`
  - route 定義: `functions/src/index.ts:14`
  - handler: `functions/src/scheduleList.ts:97-127`
- `GET /api/schedule-list`
  - route 定義: `functions/src/index.ts:15`
  - handler: `functions/src/scheduleList.ts:97-127`
- `GET /today-schedule`
  - route 定義: `functions/src/index.ts:16`
  - handler: `functions/src/todaySchedule.ts:85-120`
- `GET /api/today-schedule`
  - route 定義: `functions/src/index.ts:17`
  - handler: `functions/src/todaySchedule.ts:85-120`
- `ALL /schedule-sync`
  - route 定義: `functions/src/index.ts:18`
  - handler: `functions/src/scheduleSync.ts:74-135`
  - 実処理は `POST` のみ許可: `functions/src/scheduleSync.ts:78-84`
- `ALL /api/schedule-sync`
  - route 定義: `functions/src/index.ts:19`
  - handler: `functions/src/scheduleSync.ts:74-135`
  - 実処理は `POST` のみ許可: `functions/src/scheduleSync.ts:78-84`

### move 系
- `GET /service-records-move/unwritten`
  - mount 定義: `functions/src/index.ts:20`
  - route 定義: `functions/src/service-records-move/routes.ts:9`
  - handler: `functions/src/service-records-move/listUnwritten.ts:69-129`
- `GET /api/service-records-move/unwritten`
  - mount 定義: `functions/src/index.ts:21`
  - route 定義: `functions/src/service-records-move/routes.ts:9`
  - handler: `functions/src/service-records-move/listUnwritten.ts:69-129`
- `POST /service-records-move/summary`
  - mount 定義: `functions/src/index.ts:20`
  - route 定義: `functions/src/service-records-move/routes.ts:10`
  - handler: `functions/src/service-records-move/generateSummary.ts:50-83`
- `POST /api/service-records-move/summary`
  - mount 定義: `functions/src/index.ts:21`
  - route 定義: `functions/src/service-records-move/routes.ts:10`
  - handler: `functions/src/service-records-move/generateSummary.ts:50-83`
- `POST /service-records-move/save`
  - mount 定義: `functions/src/index.ts:20`
  - route 定義: `functions/src/service-records-move/routes.ts:11`
  - handler: `functions/src/service-records-move/saveRecord.ts:38-123`
- `POST /api/service-records-move/save`
  - mount 定義: `functions/src/index.ts:21`
  - route 定義: `functions/src/service-records-move/routes.ts:11`
  - handler: `functions/src/service-records-move/saveRecord.ts:38-123`

### home 系
- 対象コード範囲内に route 定義なし

## 5. フロント構成

### move 画面
- 画面: `public/service-records-move/index.html:10-108`
- 役割:
  - `helper_email` 入力と未記入予定の取得
  - 予定1件の選択
  - 支援内容メモ入力
  - 記録案生成
  - 保存
- `main.js` の責務:
  - API endpoint 定数の定義: `public/service-records-move/main.js:1-5`
  - 画面 state 管理: `public/service-records-move/main.js:7-11`
  - 一覧描画: `public/service-records-move/main.js:72-118`
  - 選択中予定の詳細描画: `public/service-records-move/main.js:120-149`
  - 未記入取得: `public/service-records-move/main.js:151-161`
  - 記録案生成: `public/service-records-move/main.js:163-219`
  - 保存と再読込: `public/service-records-move/main.js:221-296`
  - フォームイベント接続: `public/service-records-move/main.js:298-339`
- UI 状態:
  - 最小動線は実装済み
  - 1画面完結
  - 一覧・詳細・入力・保存ステータス表示あり
  - 予定編集画面の複数ステップ遷移はなし

### home 画面
- 画面: `public/service-records-home/index.html:85-95`
- 役割:
  - プレースホルダー表示のみ
- `main.js` の責務:
  - なし。ファイルは空
- UI 状態:
  - `準備中` 表示のみ
  - API 呼び出しなし
  - 入力 UI なし

### schedule 画面
- 画面: `public/schedule-sync/index.html`
- 役割:
  - 月単位の予定閲覧
  - 担当者名での絞り込み
  - 週表示切替
  - 日別モーダル表示
- `main.js` の責務:
  - endpoint 定数定義: `public/schedule-sync/main.js:1-2`
  - 月表示 state 管理: `public/schedule-sync/main.js:4-10`
  - モックデータ定義: `public/schedule-sync/main.js:117-245`
  - カレンダー構築: `public/schedule-sync/main.js:247-279`, `426-493`
  - 週カラム描画: `public/schedule-sync/main.js:495-543`
  - API 取得とフォールバック: `public/schedule-sync/main.js:387-410`
  - イベント接続と初期化: `public/schedule-sync/main.js:573-632`
- UI 状態:
  - 閲覧 UI は実装済み
  - `POST /api/schedule-sync` を叩く UI はない
  - `GET /api/schedule-list` 失敗時はモックデータに自動フォールバックする

## 6. move 保存フロー

基準コード:
- フロント: `public/service-records-move/main.js`
- API: `functions/src/service-records-move/*.ts`

### 1. 未記入取得
- 入力値: `helper_email`
- フロント送信: `public/service-records-move/main.js:298-336`
- 呼び出し先: `GET /api/service-records-move/unwritten`
- API 側条件:
  - `helper_email` 必須: `functions/src/service-records-move/listUnwritten.ts:73-81`
  - `schedule_tasks_move` を `helper_email` + `status = unwritten` で抽出: `functions/src/service-records-move/listUnwritten.ts:97-103`
  - date, start_time 昇順: `functions/src/service-records-move/listUnwritten.ts:102-103`

### 2. 選択
- 一覧カードクリックで `state.selectedTask` に格納: `public/service-records-move/main.js:103-117`
- 選択後に詳細を再描画: `public/service-records-move/main.js:113-115`

### 3. 入力
- `notes` 入力欄あり: `public/service-records-move/index.html:68-78`
- `summaryText` 入力欄あり: `public/service-records-move/index.html:89-98`
- 要約生成前に `notes` 必須: `public/service-records-move/main.js:169-178`

### 4. 記録案生成
- フロント呼び出し: `public/service-records-move/main.js:163-219`
- 呼び出し先: `POST /api/service-records-move/summary`
- 送信値:
  - `helperName`
  - `userName`
  - `serviceDate`
  - `startTime`
  - `endTime`
  - `task`
  - `notes`
- API 実装:
  - テンプレート生成のみ: `functions/src/service-records-move/generateSummary.ts:64-73`
  - OpenAI 連携は未実装: `functions/src/service-records-move/generateSummary.ts:65-66`

### 5. 保存
- フロント呼び出し: `public/service-records-move/main.js:221-296`
- 呼び出し先: `POST /api/service-records-move/save`
- 必須値:
  - `taskId`
  - `helperEmail`
  - `notes`
  - `summaryText`
  - 判定: `functions/src/service-records-move/saveRecord.ts:50-60`
- API 実装:
  - `service_notes_move` へ insert: `functions/src/service-records-move/saveRecord.ts:67-82`

### 6. status 更新
- `schedule_tasks_move` の更新条件:
  - `id = taskId`
  - `helper_email = helperEmail`
  - `status = unwritten`
- 更新内容:
  - `status = written`
  - `updated_at = now`
- 実装位置: `functions/src/service-records-move/saveRecord.ts:88-97`
- 更新対象 0 件時:
  - 409 を返す: `functions/src/service-records-move/saveRecord.ts:103-108`
- フロント保存成功後:
  - 入力欄クリア
  - `selectedTask` を null
  - 未記入一覧を再取得
  - 実装位置: `public/service-records-move/main.js:276-291`

## 7. ローカル環境

### 起動コマンド
- `npm run serve` 相当は `functions/package.json:7`
- 実行内容:
  - `npm run build`
  - `firebase emulators:start --only functions,hosting`

### ポート
- リポジトリ内に emulator port の明示設定なし
- `firebase.json` に port 設定なし
- よって、対象コードベースから確定できるポート番号はない

### Hosting / Functions URL
- Hosting は `firebase.json:5-13` で `public` を配信
- `/api/**` は Functions `api` に rewrite: `firebase.json:8-13`
- Functions export 名は `api`: `functions/src/index.ts:23-29`
- `public/service-records-move/main.js:1` の `BASE_URL` は `/api`
- `public/schedule-sync/main.js:1` は `/api/schedule-list`
- `public/today-schedule/main.js:1` は `/api/today-schedule`
- 実運用の完全 URL はコードベース内に記載なし

## 8. 問題点・リスク

### 衝突リスク
- route 名前空間は `move` と `schedule` で分かれている
- `home` API は未実装のため、今後追加時に命名ルールを固定しないと衝突余地がある
- `schedule-sync` という画面名と `schedule-sync` API 名が同名
  - フロント実装は `GET /api/schedule-list` を使用
  - API 名だけ見ると sync 実行画面に見えやすい

### 不整合リスク
- `move` 保存時の insert カラムは TODO 前提
  - `functions/src/service-records-move/saveRecord.ts:66`
  - `service_notes_move` 実カラムとの差分があると保存失敗する
- `schedule-sync` 画面は API 失敗時にモック表示へフォールバックする
  - `public/schedule-sync/main.js:393-408`
  - 実データ未取得でも画面上は動作して見える
- `runMoveScheduleSync()` は `schedule` テーブル件数を数えるだけ
  - `functions/src/scheduleSync.ts:32-49`
  - `move` 専用同期処理ではない
- `runHomeScheduleSync()` はログ出力と成功レスポンスのみ
  - `functions/src/scheduleSync.ts:52-60`
  - home 同期は未実装

### 事故りやすい箇所
- `move` は保存成功時に insert と status update を別クエリで実行している
  - `functions/src/service-records-move/saveRecord.ts:82`, `88-97`
  - transaction 制御はない
- `move` の一覧取得条件は `status = unwritten` 固定
  - status 値の表記揺れに弱い
- `home` は UI / API / table 参照のどれも実装がないため、並行開発時に命名や I/O 仕様が先に分岐しやすい

## 9. 次にやるべきタスク

### 優先 1: move
- `service_notes_move` の実カラム定義に合わせて `saveRecord.ts` の insert payload を確定
- `move` 保存を insert 成功 / status 更新成功まで一貫して検証
- `status` の値を `unwritten` / `written` で固定運用するか明文化

### 優先 2: home
- `functions/src/service-records-home/` を新設
- `home` 専用テーブル名をコードに固定
- `move` と同じ責務で `home` の GET / POST ルートを別 namespace で追加
- `public/service-records-home/` に実画面と `main.js` を追加

### 優先 3: 共通
- `move` と `home` の route, payload, status 名を文書化して共有
- `schedule` テーブルと `schedule_tasks_move` の責務分離を明記
- emulator port とローカル URL を設定ファイルで固定
- `schedule-sync` 画面のモックフォールバック使用可否を決める
