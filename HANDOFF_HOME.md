# HANDOFF HOME

## 1. 現状

### 存在するもの
- `public/service-records-home/index.html`
- `public/service-records-home/main.js`
- `public/service-records-home/style.css`

### 存在しないもの
- `functions/src/service-records-home/`
- `home` 専用 route 定義
- `home` 専用 API handler
- `home_schedule_tasks` 参照コード
- `service_notes_home` 参照コード

## 2. 実装済み範囲

### フロント
- `public/service-records-home/index.html:85-95`
- 表示内容:
  - タイトル `居宅介護サービス記録`
  - ステータス `準備中`
  - 文言 `このページは現在作成中です。`

### 未実装範囲
- `public/service-records-home/main.js` は 0 byte
- `public/service-records-home/style.css` は 0 byte
- API 呼び出しなし
- 入力 UI なし
- 一覧表示なし
- 保存処理なし

## 3. API 一覧

### home 専用 API
- 対象コード範囲内に存在しない

### 参考: 現在存在する API
- `GET /schedule-list`
- `GET /api/schedule-list`
- `GET /today-schedule`
- `GET /api/today-schedule`
- `ALL /schedule-sync`
- `ALL /api/schedule-sync`
- `GET /service-records-move/unwritten`
- `GET /api/service-records-move/unwritten`
- `POST /service-records-move/summary`
- `POST /api/service-records-move/summary`
- `POST /service-records-move/save`
- `POST /api/service-records-move/save`

route 集約定義:
- `functions/src/index.ts:14-21`

## 4. 使用テーブル

### home 専用テーブル参照
- `home_schedule_tasks`: 参照なし
- `service_notes_home`: 参照なし
- `schedule_tasks_home`: 参照なし

### 現在コードにある関連テーブル
- `schedule`
- `schedule_tasks_move`
- `service_notes_move`

## 5. フロント構成

### 画面の役割
- 現状は「home 機能の入口表示」のみ
- 実業務フローは載っていない

### `main.js` の責務
- 現状なし

### UI 状態
- 実装状態はプレースホルダー
- 操作可能な要素は戻るリンクのみ

## 6. move との分離前提で見た注意点

- `home` はまだ未実装なので、ここから `move` の route / payload / table を流用すると混線しやすい
- `move` は `schedule_tasks_move` と `service_notes_move` を使っている
- `home` は別 route prefix、別 table 名、別 handler ディレクトリで立てる必要がある

## 7. ローカル環境

### 現在確定していること
- `functions/package.json:7`
  - `firebase emulators:start --only functions,hosting`
- `firebase.json:8-13`
  - `/api/**` を Functions `api` に rewrite

### 未確定
- emulator port 番号
- `home` 固有の BASE_URL
- `home` 固有の endpoint
- `home` 固有の Functions URL

## 8. リスク

### 仕様ドリフト
- `home` の実装がまだないため、先に着手した人ごとに route 名や payload 名がずれる危険がある

### move との混線
- `move` 実装をコピーして table 名だけ差し替える進め方だと、route や status 名の混在が起きやすい

### schedule との責務混同
- `schedule-sync` 画面は予定閲覧 UI
- `schedule-sync` API は同期入口
- `home` をここへ混ぜると責務がさらに曖昧になりやすい

## 9. 次タスク

### 最優先
- `functions/src/service-records-home/` を新設
- `home` 専用 route prefix を固定
  - 例ではなく、実装時にコード上で固定名を決める
- `home` で使うテーブル名をコードに明示する

### 次点
- `public/service-records-home/index.html` を実画面へ差し替える
- `public/service-records-home/main.js` に state / fetch / save 実装を追加

### 共通
- `move` と `home` の route 一覧を別表で管理する
- payload 項目名を `move` と `home` で独立定義する
- status 運用を機能別に分けるか共通にするか先に決める
