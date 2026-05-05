# CURRENT_STATE — 3アプリ横断の現状ビュー

> **このドキュメントの位置付け**
> - **共有契約の正**: `docs/SUPABASE_SCHEMA.md` （Supabase の全テーブル・ビュー・アプリ別参照をまとめた詳細版）
> - **本ファイル**: API エンドポイント・画面 URL・Cloud Scheduler ジョブの横断ビュー。新しいチャットが「3アプリの全体像を1ページで把握する」ための入り口。
>
> スキーマを知りたい → `SUPABASE_SCHEMA.md`
> 画面やAPIの全体像を知りたい → 本ファイル
> 変更履歴 → `CHANGELOG.md`
> 作業ルール → `RULES.md`

最終更新: 2026-04-19
更新者: 奥原翼（2026-04-18 初版 → 2026-04-19 電子契約 Phase 0〜4 雛形を追記）

---

## 1. 3アプリ概要

| # | アプリ名 | 対象ユーザー | ホスティング | リポジトリ | フレームワーク |
|---|---|---|---|---|---|
| 1 | **ビレッジひろば** (village-tsubasa) | ヘルパー | Firebase `village-tsubasa.web.app` | `tsubasa-okuhara/village-tsubasa` | HTML/JS + Firebase Functions (Express) |
| 2 | **village-admin** | 社内管理者 | Firebase `village-admin-bd316.web.app` | `tsubasa-okuhara/village-admin`（想定） | HTML/JS + Firebase Functions |
| 3 | **利用者スケジュールアプリ** | 利用者（116名） | GitHub Pages `tsubasa-okuhara.github.io/user-schedule-app/` | `tsubasa-okuhara/user-schedule-app` | 静的サイト + Supabase anon 直叩き |

共有基盤: **Supabase プロジェクト `pbqqqwwgswniuomjlhsh.supabase.co`**

---

## 2. village-tsubasa（ヘルパー用）

### 2.1 API エンドポイント一覧

ベース URL: `https://asia-northeast1-village-tsubasa.cloudfunctions.net/api`
(旧パスと `/api/` プレフィックス付きの両方が受け付けられる。新規実装は `/api/` 版を推奨)

**schedule 系（9）**
- `GET  /api/schedule-list` — 月間スケジュール一覧（year/month 指定）
- `GET  /api/today-schedule` — 今日の自分の予定（`helper_email` 必須）
- `GET  /api/tomorrow-schedule` — 明日の自分の予定
- `GET  /api/today-schedule-all` — 今日の全員予定（管理者向け）
- `GET  /api/tomorrow-schedule-all` — 明日の全員予定
- `GET  /api/next-helper-schedule` — 次の予定1件（ホーム画面の「次の予定」カード）
- `GET  /api/today-helper-summary` — 今日のヘルパーサマリ
- `GET  /api/tomorrow-helper-summary` — 明日のヘルパーサマリ
- `POST /api/schedule-sync` — スプレッドシート側の件数を返すモニタ用

**service-records-move 系（3）**
- `GET  /api/service-records-move/unwritten` — 未記録の移動支援タスク一覧
- `POST /api/service-records-move/summary` — AI要約生成
- `POST /api/service-records-move/save` — 記録保存

**service-records-home 系（3）**
- `GET  /api/service-records-home/unwritten` — 未記録の居宅介護タスク一覧
- `POST /api/service-records-home/summary` — AI要約生成
- `POST /api/service-records-home/save` — 記録保存

**service-records-structured 系（5）**（構造化記録の新系統）
- `GET  /api/service-records-structured/options` — 選択肢マスタ（動作種別など）
- `GET  /api/service-records-structured/list` — 一覧
- `GET  /api/service-records-structured/by-source/:sourceNoteId` — 元記録 ID で取得
- `POST /api/service-records-structured/save` — 保存
- `GET  /api/service-records-structured/:id` — 詳細

**push 通知系（4）**
- `GET  /api/push/public-key` — VAPID 公開鍵
- `POST /api/push/subscribe` — 購読登録
- `POST /api/push/unsubscribe` — 購読解除
- `POST /api/push/test` — テスト送信

**アプリ内通知系（2）**
- `GET  /api/notifications` — 自分宛の通知一覧（`target_email` 絞り込み）
- `POST /api/notifications/read` — 既読化

**通知ジョブ手動起動系（2）**
- `POST /api/notify-today` — 今日の通知を手動実行（通常は Scheduler が呼ぶ）
- `POST /api/notify-tomorrow` — 明日の通知を手動実行

**匿名フィードバック系（4）**
- `POST /api/feedback` — ヘルパーからの匿名フィードバック送信（AI整形）
- `GET  /api/feedback` — 未読フィードバック一覧（管理者）
- `POST /api/feedback/update-status` — ステータス更新（read / archived）
- `GET  /api/feedback/resolved` — 対応済み一覧

**研修報告系（5）**
- `POST /api/training-reports` — ヘルパー研修報告の送信
- `POST /api/training-reports/notice` — 管理者からの研修お知らせ投稿
- `GET  /api/training-reports` — 報告+お知らせ一覧
- `POST /api/training-reports/update-status` — ステータス更新
- `POST /api/training-reports/delete` — 削除

**研修資料系（5）**（2026-04-18 追加）
- `POST /api/training-materials` — 資料登録（AI がチェック5項目を自動生成）
- `GET  /api/training-materials` — 一覧（ヘルパー画面用にも開放）
- `GET  /api/training-materials/:id` — 1件取得
- `POST /api/training-materials/update` — 学習項目編集 / 有効無効切替
- `POST /api/training-materials/delete` — 削除

**電子契約系（15）**（2026-04-19 追加、Phase 3 雛形）
- GET  /api/contracts/templates — テンプレート一覧（管理者）
- POST /api/contracts/templates — テンプレート登録
- GET  /api/contracts/templates/:id — テンプレート1件
- POST /api/contracts/templates/:id/new-version — バージョンアップ
- POST /api/contracts/templates/:id/deactivate — 停止
- GET  /api/contracts — 契約一覧（管理者）
- POST /api/contracts — 契約ドラフト作成
- GET  /api/contracts/mine — 自分宛契約一覧（ヘルパー／署名者）
- GET  /api/contracts/:id — 契約詳細
- POST /api/contracts/:id/send — 外部API送信（⚠️ Phase 3.2 未実装、501）
- POST /api/contracts/:id/revoke — 撤回
- GET  /api/contracts/:id/download — 署名済PDF取得（⚠️ 501）
- GET  /api/contracts/:id/sign-url — 署名URL発行（⚠️ 501）
- GET  /api/contracts/:id/audit — 監査ログ
- POST /api/contracts/webhook/cloudsign — クラウドサイン Webhook 受信（⚠️ parse 未実装）

**落ち着き確認系（7）**（2026-04-14 追加）
- `GET  /api/calm-checks/pending` — 未回答一覧（`helper_email` 指定）
- `POST /api/calm-checks/answer` — 回答送信
- `POST /api/calm-checks/generate` — 今日のスケジュールから確認レコード生成
- `GET  /api/calm-checks/history` — 回答履歴（管理者用）
- `GET  /api/calm-checks/targets` — 対象利用者一覧
- `POST /api/calm-checks/targets` — 対象追加
- `POST /api/calm-checks/targets/remove` — 対象削除（論理削除）

**ヘルパー検索系（1）**
- `GET  /api/helpers/lookup` — email → 名前の逆引き

**セルフマッチング系（3）**（2026-05-06 追加、Phase 1）
- `GET  /api/self-matching/candidates` — 未割当予定の候補一覧（`helper_email` 必須、`enable_self_matching=true` のヘルパーのみ）
- `POST /api/self-matching/claim` — 「入れます」申請（schedule_claims に INSERT）
- `POST /api/self-matching/withdraw` — 自分の pending 申請を取り下げ

**ヘルスチェック（1）**
- `GET  /healthz` — `"ok"` を返すだけ

### 2.2 画面 URL 一覧（`public/` 配下）

ベース URL: `https://village-tsubasa.web.app/`

| パス | 役割 |
|---|---|
| `/` (`index.html`) | ヘルパーホーム。次の予定・未記録数・落ち着き確認アラート等を表示 |
| `/today-schedule/` | 今日の自分の予定 |
| `/tomorrow-schedule/` | 明日の自分の予定 |
| `/today-schedule-all/` | 今日の全員予定（管理者向け） |
| `/tomorrow-schedule-all/` | 明日の全員予定 |
| `/schedule-sync/` | スケジュール同期モニタ |
| `/service-records-move/` | 移動支援記録入力 |
| `/service-records-home/` | 居宅介護記録入力 |
| `/notifications/` | アプリ内通知一覧 |
| `/feedback/` | 匿名フィードバック投稿（ヘルパー） |
| `/feedback-admin/` | フィードバック対応（管理者） |
| `/training-reports/` | 研修報告入力（ヘルパー） |
| `/training-reports-admin/` | 研修報告・資料管理（管理者） |
| `/calm-check/` | 落ち着き確認フォーム |
| `/expense/` | 経費提出（ヘルパー向け） |
| `/self-matching/` | 空き時間で支援に入る（未割当予定に「入れます」と申請、2026-05-06 追加、Phase 1） |
| `/contracts/` | 雇用契約 一覧（2026-04-19 追加、Phase 4 雛形） |
| `/contracts/sign.html` | 契約署名画面（Phase 4 雛形、実フローは Phase 3.2 以降） |
| `/contracts/viewer.html` | 締結済契約の閲覧（Phase 4 雛形） |

### 2.3 Cloud Scheduler ジョブ（Firebase Functions v2 の `onSchedule`）

| ジョブ名 | cron | 用途 |
|---|---|---|
| `notifyTodaySchedule` | `0 7 * * *` (JST) | 毎朝7時、今日の予定をヘルパーに push 通知 |
| `notifyTomorrowSchedule` | `0 20 * * *` (JST) | 毎晩20時、明日の予定をヘルパーに push 通知 |

### 2.4 GAS（Google Apps Script）プロジェクト

Supabase と連動する GAS が2つあり、直接スケジュールデータを更新する:

| GASプロジェクト名 | 用途 | トリガー |
|---|---|---|
| 【ビレッジつばさ】全体スケジュール | スプレッドシート ⇄ Supabase 双方向同期 | 手動 / 日次 |
| スケジュール逆同期 | 利用者アプリ → Supabase → スプレッドシート即時反映。月次シート自動作成 | 毎月15日 00:05 |

詳細は `SUPABASE_SCHEMA.md` の「10. スプレッドシート同期」を参照。

---

## 3. village-admin（管理者用、別リポジトリ）

別リポの `functions/src/` で以下を実装していると想定（本リポジトリでは未マウント）:
- `functions/src/dashboard/summary.ts` — サマリカウント
- `functions/src/dashboard/search.ts` — 横断検索
- `functions/src/dashboard/export-move.ts` / `export-home.ts` — Excel 出力
- `functions/src/dashboard/service-notes.ts` — 記録一覧＋ `sent_at` UPDATE
- `functions/src/dashboard/excel-home.ts` — `parseMemo` / `parseTimeFromFinalNote`
- `functions/src/middleware/adminAuth.ts` — `admin_users` による allow-list
- `functions/src/error-alerts/list.ts` / `dismiss.ts` — エラーアラート管理

**画面一覧**（`public/` 配下、ベース: `https://village-admin-bd316.web.app/`）

| パス | 役割 |
|---|---|
| `/` (`index.html`) | ダッシュボード。未記録件数・未読フィードバック・未読研修報告の stat-card、30秒ポーリング |
| `/schedule.html` | 予定一覧 |
| `/search.html` | 横断検索（利用者名・日付・ヘルパーなど） |
| `/service-notes-move.html` | 移動支援の完成記録一覧＋Excel出力＋一斉送信（`sent_at` UPDATE） |
| `/service-notes-home.html` | 居宅介護の完成記録一覧＋Excel出力＋一斉送信 |
| `/helper-qualification.html` | ヘルパー資格管理 |
| `/training.html` | 研修管理（2サブタブ：📚資料マスタ / 📝報告・お知らせ一覧）。2026-04-18 追加 |

**共有テーブル参照**: `SUPABASE_SCHEMA.md` の各テーブルに「village-admin からの参照箇所」が明記されている。新規機能を village-admin 側で作る場合は、該当テーブルの `service_notes_*.memo` / `final_note` の独自フォーマット依存（`parseMemo`）に注意。

**village-tsubasa API の消費**: village-admin は村上翼さん側で独自の Functions を持ちつつ、研修系は village-tsubasa 側の API（`/api/training-materials*`, `/api/training-reports*`）を直接呼び出している。つまり village-tsubasa 側で研修系 API を破壊的変更すると admin の `/training.html` が壊れる。変更時は `CHANGELOG.md` に明記すること。

---

## 4. user-schedule-app（利用者用、別リポジトリ）

- ホスティング: GitHub Pages（Firebase Functions 不使用想定）
- Supabase には **anon キーで直接接続**（= RLS が効いていないと危険）
- 主要画面: `schedule.html` の `loadSchedule` / `doAdd` / `doEdit` / `doCancel` / `doSubmit`
- 116名の利用者に配布済み

**重要な注意**: `schedule` テーブルの RLS は 2026-04-17 時点で OFF。利用者が別利用者の予定を閲覧・編集できる理論上の経路があるため、今後 RLS を ON にする際は user-schedule-app の anon key でも SELECT/INSERT/UPDATE/DELETE が通るポリシー設計が必須。

---

## 5. 情報の更新方法

本ファイルは **週次で見直し、機能追加・削除があれば随時更新** する運用。更新が必要なのは:

1. `functions/src/index.ts` に新しいエンドポイントを追加したとき → 「2.1 API エンドポイント一覧」に追記
2. 新しい画面を `public/` に追加したとき → 「2.2 画面 URL 一覧」に追記
3. 新しい Scheduler ジョブを作ったとき → 「2.3 Cloud Scheduler ジョブ」に追記
4. 3アプリのいずれかが廃止・統合されたとき → 「1. 3アプリ概要」を更新

変更の詳細は `CHANGELOG.md` に記録、スキーマ変更は `SUPABASE_SCHEMA.md` に記録。

---

## 6. 参考リンク

- ブリーフィング原本: `docs/BRIEFING_CROSS_APP_COORDINATION.md`
- 詳細スキーマ: `docs/SUPABASE_SCHEMA.md`
- 研修システム引き継ぎ: `docs/HANDOFF_TRAINING_SYSTEM.md`
- プロジェクト入門: `00_START_HERE.md`
- アーキテクチャ概要: `ARCHITECTURE.md`
