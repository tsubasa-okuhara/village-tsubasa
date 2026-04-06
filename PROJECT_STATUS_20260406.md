# ビレッジひろば 開発状況メモ
## 2026年4月6日 21:00時点

---

## 本日完了した作業

### 1. Cloud Scheduler cron式修正
- `functions/src/index.ts` の cron式を JST基準に修正
- 変更前: `"0 22 * * *"` / `"0 11 * * *"`（UTCのつもりだったがJSTで評価されていた）
- 変更後: `"0 7 * * *"`（朝7時 今日の予定）/ `"0 20 * * *"`（夜20時 明日の予定）
- デプロイ済み

### 2. 通知テストデータ掃除
- Supabaseの `notifications` テーブルから手動投入テストレコードを削除

### 3. 通知タイプ別色分け
- `public/notifications/index.html` に CSS追加
- 本日の予定 = 赤（#a83a46）、明日の予定 = オレンジ（#9a6830）、お知らせ = 青（#3a6aa8）
- 未読カードの左ボーダーも色分け
- デプロイ済み

### 4. 概要欄の非表示
- `public/today-schedule/main.js`
- `public/tomorrow-schedule/main.js`
- `public/today-schedule-all/main.js`
- `public/tomorrow-schedule-all/main.js`
- 4画面から「⚠️ 概要」行を削除
- デプロイ済み

### 5. 「ビレッジひろばに戻る」ボタン追加
- `public/today-schedule/index.html`
- `public/tomorrow-schedule/index.html`
- `public/notifications/index.html`
- ブラウンテーマ（#6b4c3b）の目立つボタン、ページ上部に配置
- デプロイ済み

### 6. saveRecord.ts カラム名修正（移動支援）
- `village-tsubasa-move/functions/src/service-records-move/saveRecord.ts`
- `schedule_task_id` → `schedule_task_move_id` に全6箇所修正
- TypeScriptビルド通過確認済み
- **注意**: このファイルは `village-tsubasa-move/functions/` 配下。メインの `functions/` とは別ディレクトリ

### 7. 通知 ilike修正
- `functions/src/notifications.ts`
- `.eq("target_email", ...)` → `.ilike("target_email", ...)` に3箇所修正
- メールアドレスの大文字小文字を無視して通知取得

### 8. ステータス資料作成
- `public/village-tsubasa-status.pdf` — PDF レポート（reportlab使用）
- `public/village-tsubasa-status.docx` — DOCX レポート（docx-js使用）
- `public/village-tsubasa-summary.md` — テキストまとめ
- フォント: Carlito（Latin: `/usr/share/fonts/truetype/crosextra/`）+ DroidSansFallbackFull（日本語）

### 9. 居宅サービス記録（home）確認
- `public/service-records-home/` — 画面もAPIも実装済みだった
- `functions/src/service-records-home/` — saveRecord.ts, generateSummary.ts, listUnwritten.ts
- ルート登録済み（index.ts）
- 本番で表示確認済み
- まだ実データでの動作テストは未実施

---

## GitHub 最新コミット
- `0156a1e` — feat: 戻るボタン追加・通知色分けデプロイ・ステータス資料作成
- ブランチ: main
- リポジトリ: tsubasa-okuhara/village-tsubasa

---

## 未完了・次回やること

### 優先（すぐやる）
1. **今夜20時の自動通知の結果確認**
   - Supabaseの `notifications` テーブルで、notification_type="tomorrow" のレコードが自動生成されたか確認
   - Push通知が届いたか確認

2. **moveの保存フロー実データテスト**
   - saveRecord.ts のカラム名修正はコード上完了
   - ただし `village-tsubasa-move/functions/` のビルド＆デプロイがまだ必要かもしれない
   - 実際に保存APIを叩いて `service_notes_move` にレコードが入るか確認

3. **居宅サービス記録（home）の動作検証**
   - 未記入一覧取得 → 記録入力 → AI要約生成 → 保存 の一連フローを実データで確認
   - `home_schedule_tasks` テーブルにテストデータがあるか確認

### 次の開発
4. **moveの保存フロー修正の確認**
   - `village-tsubasa-move/` が別ディレクトリなので、デプロイ方法を確認
   - メインの `functions/` に統合されているか、別デプロイが必要か確認

5. **ホーム画面から居宅サービス記録へのリンク追加**
   - `public/index.html` の業務メニューに居宅サービス記録カードを追加

6. **居宅サービス記録に「ビレッジひろばに戻る」ボタン追加**
   - 他3ページと同じスタイルで追加

### 将来の計画
7. **カレンダー連携（任意機能）**
   - Google Calendar APIで予定自動登録 + 1時間前リマインダー
   - Apple Calendar は .ics エクスポートまたは CalDAV
   - ユーザー任意で有効化（強制ではない）
   - アプリ設定画面にトグルを配置

8. **通知の動的並び替え**
   - 新着通知タイプに応じてホーム画面カードの表示順を動的変更
   - 今日の通知が来たら一番上に、管理者通知が来たら上に、等

---

## 技術メモ

### Firebase認証切れ
- `firebase login --reauth` で再認証が必要になることが頻繁にある
- デプロイ前に毎回確認

### Git lockファイル問題
- `.git/index.lock` や `.git/HEAD.lock` が残ることがある
- `rm ~/village-tsubasa/.git/index.lock` で手動削除

### サンドボックス制限
- このCowork環境からは `git push` と `firebase deploy` は実行できない（403エラー）
- ユーザーのターミナルで実行する必要がある

### cron式のタイムゾーン
- `timeZone: "Asia/Tokyo"` を指定すると、cron式はJSTとして評価される（UTCではない）
- `"0 7 * * *"` + `timeZone: "Asia/Tokyo"` = 毎日JST 7:00

### フォント（PDF生成用）
- Latin: `/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf`（`carlito/` ではなく `crosextra/`）
- 日本語: `/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf`（ASCII文字なし、日本語のみ）

---

## ファイル構成（主要）

```
village-tsubasa/
├── public/
│   ├── index.html                    # ホーム画面
│   ├── index.js                      # ホームJS
│   ├── today-schedule/               # 今日の予定（個人）
│   ├── tomorrow-schedule/            # 明日の予定（個人）
│   ├── today-schedule-all/           # 今日の予定（全体）
│   ├── tomorrow-schedule-all/        # 明日の予定（全体）
│   ├── notifications/                # 通知一覧
│   ├── service-records-move/         # 移動支援記録
│   ├── service-records-home/         # 居宅サービス記録
│   └── schedule-list/                # 月間スケジュール
├── functions/
│   └── src/
│       ├── index.ts                  # エントリポイント・ルート定義
│       ├── notifications.ts          # 通知CRUD
│       ├── scheduledNotifications.ts # 自動通知ロジック
│       ├── push.ts                   # Push通知管理
│       ├── service-records-home/     # 居宅記録API
│       └── service-records-move/     # （ルート参照のみ？）
├── village-tsubasa-move/
│   └── functions/src/
│       └── service-records-move/     # 移動支援記録API（別ディレクトリ）
│           ├── saveRecord.ts         # ← schedule_task_move_id修正済み
│           ├── generateSummary.ts
│           └── listUnwritten.ts
├── sql/                              # SQLスキーマ・テストデータ
├── HANDOFF_MOVE.md                   # move実装の引き継ぎ文書
└── PROJECT_STATUS_20260406.md        # ← このファイル
```
