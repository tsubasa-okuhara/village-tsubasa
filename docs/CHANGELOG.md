# CHANGELOG — 3アプリ横断の変更ログ

> **目的**: 3アプリ（village-tsubasa / village-admin / user-schedule-app）のいずれかで **他アプリに影響しうる変更** があった際に追記する台帳。
>
> **書き方**:
> ```
> ## YYYY-MM-DD [リポ名] 変更タイトル
> - 変更内容
> - 影響範囲: （他アプリへの影響、なければ「本リポ内のみ」）
> - 関連コミット/PR: （あれば）
> ```
>
> 記入タイミング: **チャット終了時**、または他アプリに影響しうる変更をデプロイしたとき。
> **追記型**（削除・改変は原則しない）。誤記の訂正は日付を残したまま `[訂正 2026-04-18: 旧記述は…]` のように追記。

最終更新: 2026-04-25 夜（RLS + Security Advisor 完了、schedule-sync / tomorrow-schedule-all UI 修正）

---

## 🔔 次回チャットで Claude が奥原さんに確認すべきこと

> **新チャットの Claude へ**: 以下を作業冒頭で必ず聞いてください。
> 奥原さんが「やる」と答えたら実施、「やらない」と答えたら本セクションを削除してください。

- **`today-schedule` / `today-schedule-all` / `tomorrow-schedule` の3ページに、`tomorrow-schedule-all` と同じ `formatTimeRange` 修正（end_time なしでも start_time を表示）を入れますか？**
  - 背景: 2026-04-25 に `tomorrow-schedule-all` だけ修正したが（commit `9cb3edc`）、他3ページにも同じバグが残っており「時間未設定」と表示される
  - 修正内容: 各 `main.js` の `formatTimeRange` 関数に4行追加するだけ（パターンは tomorrow-schedule-all と同じ）
  - 対象ファイル:
    - `public/today-schedule/main.js` L87-99
    - `public/today-schedule-all/main.js` L44-52
    - `public/tomorrow-schedule/main.js` L87-99
  - 慎重派: 1ページずつデプロイ・動作確認してから次へ進む
  - 関連: `docs/FUTURE_IDEAS.md` 即席メモ 2026-04-25 行

---

## 2026-04-25 [village-tsubasa] schedule-sync で「担当：担当未設定」予定を非表示に / tomorrow-schedule-all で start のみでも時間表示

奥原さんからの2件の UI 改善要望を反映。

### 1. `/schedule-sync/` カレンダーから「担当：担当未設定」のカードを非表示
- `public/schedule-sync/main.js` の `applyFilters` を修正（4行追加）
- `schedule_web_v` ビューが空 helper を `'担当未設定'` という文字列に変換して
  返すため、初回修正の `helperNames.length === 0` では弾けず表示されていた
- 修正後: `hasRealHelper = helperNames.some(name => name && name !== "担当未設定")`
  がfalseのアイテムを除外。複数ヘルパーで1人だけ「担当未設定」の場合は
  実在ヘルパーがいるので残す
- ビュー側（schedule_web_v）の挙動は変更していないので、他の API
  （today-schedule / tomorrow-schedule / helperSummary 等）への影響なし
- 関連コミット: `9cb3edc`（初回修正、`length === 0` チェックでは
  ビューが返す「担当未設定」文字列を弾けず不十分）→ `bd1885c`（追加修正、完成）

### 2. `/tomorrow-schedule-all/` で end_time なしでも start_time を表示
- `public/tomorrow-schedule-all/main.js` の `formatTimeRange` を修正（4行追加）
- 旧: start と end どちらか欠けると「時間未設定」表示
- 新: 両方あれば `start〜end`、start のみあれば `start` だけ表示、両方なければ「時間未設定」
- ⚠️ 同じバグが `today-schedule` / `today-schedule-all` / `tomorrow-schedule`
  にも残存。次回チャットで奥原さんに確認後に修正予定
  （上の「🔔 次回チャットで確認すべきこと」参照）
- 関連コミット: `9cb3edc`

### 影響範囲
- village-tsubasa の `public/` 配下のみ。Firebase Functions / Supabase /
  他アプリへの影響なし
- デプロイは Firebase Hosting のみ（Functions 不要）

## 2026-04-25 [village-tsubasa] Security Advisor クリーンアップ（Errors=0 / Warnings=11→6）

RLS 全フェーズ完了後、Supabase Security Advisor を確認:

### Errors (1 → 0)
- ❌ → ✅ `Security Definer View` on `public.schedule_web_v`
  - 修正: `ALTER VIEW public.schedule_web_v SET (security_invoker = true);`
  - これで anon 経由のビュー読み込みも基底テーブル（schedule, helper_master）の
    RLS ポリシーを尊重するようになった

### Warnings (11 → 6)
- ✅ Function Search Path Mutable × 5件解消
  - `fill_helper_email_home/move/schedule`、`prevent_receipt_delete`、
    `prevent_receipt_audit_modification` の5関数に
    `SET search_path = pg_catalog, public, pg_temp` を設定
  - 適用 SQL: public スキーマの全関数を走査して未設定のものに自動適用する
    DO ブロック（汎用、再実行可）

### 残ったまま OK の Warnings (6件)
- **RLS Policy Always True × 5件** — Phase 3 選択肢A の意図的な選択 + 既存テーブル
  - `public.schedule` / `public.notifications` / `public.client_users` ←我々
  - `public.helper_priority` / `public.process_log` ←既存（用途未確認）
  - 厳密化は Phase 4（中長期）で対応
- **Leaked Password Protection Disabled × 1件** — Supabase Auth の設定。
  村のつばさは **Firebase Auth を使用**しており Supabase Auth は不使用なので無関係

### 新発見
- `helper_priority` と `process_log` には既存で「USING (true)」相当の
  ゆるいポリシーが付いていることが判明（誰がいつ作ったか不明）
- これも `SUPABASE_SCHEMA.md` §8.6 に追記

## 2026-04-25 [village-tsubasa] 🎉 RLS 段階移行 全フェーズ完了

### 達成内容
2026-04-13 に Supabase から届いた `rls_disabled_in_public` /
`exposed_sensitive_data` 警告メールへの対応を完遂。**27 オブジェクト全てが
RLS ON または service_role 専用アクセス**になった。

### 適用結果
- ✅ **Phase 1**（Group A 17テーブル + contracts 5テーブル IF EXISTS スキップ）
  - `sql/enable_rls_group_a.sql` を Supabase で Run
  - service_role 専用アクセス（ポリシー無し）
  - 対象: schedule_tasks_move / service_notes_move / move_check_logs /
    home_schedule_tasks / service_notes_home / service_action_logs_home /
    service_record_structured / service_action_logs / service_irregular_events /
    training_reports / training_materials / calm_checks / calm_check_targets /
    anonymous_feedback / push_subscriptions / admin_users / admin_error_alerts
- ✅ **Phase 3**（Group B 4テーブル）
  - `sql/enable_rls_schedule.sql` を Supabase で Run
  - 採用方針: 選択肢A（anon 全許可で警告だけ消す、現状の挙動維持）
  - schedule: `FOR ALL TO anon` ポリシー
  - helper_master: `FOR SELECT TO anon` ポリシー
  - notifications: `FOR INSERT TO anon` ポリシー
  - client_users: `FOR ALL TO anon` ポリシー（保守的）

### 動作確認（全て OK）
- ✅ 利用者スケジュールアプリ `https://tsubasa-okuhara.github.io/user-schedule-app/schedule.html`
- ✅ ヘルパーアプリ「今日の予定」 `https://village-tsubasa.web.app/today-schedule/`
- ✅ ヘルパーアプリ「ホーム」 `https://village-tsubasa.web.app/`
- ✅ 管理ダッシュボード `https://village-admin-bd316.web.app/`

### **影響範囲**
- Supabase 警告メール（`rls_disabled_in_public`）が解消される見込み
- **anon キー（GitHub Pages 公開済）から無制限に読めた状態は終了**
- ただし、Phase 3 で anon 全許可ポリシーを付けた4テーブルは「警告は消えるが
  実質的には誰でも読める」状態。これは利用者アプリ（116名配布済）の挙動を
  維持するための妥協で、Phase 4（厳密化）で別途対応予定

### 関連事故記録
- 2026-04-25 [village-admin] Firebase Secret 修正（隠れバグ事故）→ 同日エントリ参照
- Phase 1 を初回適用時に管理ダッシュボード破損 → ロールバック → secret 修正
  → Phase 1 再適用成功 という流れだった

### Phase 4 候補（中長期、未着手）
- 利用者アプリの認証導入（utility ID / beneficiary_number ベース）
- `client_users` テーブルの実態調査と適切なポリシー設計
- 未文書化テーブル `helper_priority` / `process_log` の用途調査
- 電子契約 `contracts` 5テーブルを Supabase に作成（`sql/create_contracts.sql` 適用）

## 2026-04-25 [village-admin] Firebase Secret `SUPABASE_SERVICE_ROLE_KEY` 修正（**隠れバグ発覚事故**）

### 何が起きたか
- 同日の Phase 1（Group A 17テーブル RLS ON）適用直後、管理ダッシュボード
  `https://village-admin-bd316.web.app/` の「未記録（移動支援/居宅介護）」
  「完成（移動支援/居宅介護）」のカウントが**全部0件**になる事象が発生
- `本日の予定 47件`（`schedule_web_v` 経由、まだ RLS OFF）と
  `未読研修報告 21件`（village-tsubasa API 経由、service_role）は表示されており、
  **village-admin 自身の summary.ts 経由のクエリだけ**が結果0件

### 即時対応
- 全 17テーブルを `DISABLE ROW LEVEL SECURITY` に戻して**ロールバック完了**
- 管理ダッシュボードのカウントは正常値に復帰

### 根本原因
- `village-admin/functions/src/lib/supabase.ts` のコードは正しく
  `SUPABASE_SERVICE_ROLE_KEY` を `defineSecret` で読んでいた
- しかし **Firebase Secret Manager に保存されていた値が anon キー**だった
  （`firebase functions:secrets:access` で取得して JWT decode → `role: anon`）
- service_role の名前で anon キーが入っていたため、RLS が ON になった瞬間に
  全クエリが拒否されて 0件レスポンスになっていた
- これは 2026-04-17 の GAS スクリプトプロパティ別プロジェクト事故と
  **同パターンの再発**（村のつばさで2回目）

### 修正
1. Supabase Dashboard → Settings → API から正しい `service_role` キーを取得
2. `firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY --project village-admin-bd316`
   で上書き（バージョン3として保存）
3. 同コマンドの「stale function を再デプロイしますか？」プロンプトに `Y`
   → `api(asia-northeast1)` Function を新シークレットで自動再デプロイ
   + 古いバージョン（anon 入り）を Secret Manager から削除
4. `firebase functions:secrets:access` + JWT decode で
   `role: service_role | ref: pbqqqwwgswniuomjlhsh` を確認
5. 管理ダッシュボード強制リロード → 正常動作確認（**RLS は OFF のまま**）

### **影響範囲**
- `village-admin` Firebase Functions が今後 RLS bypass で動作するようになった
  （RLS が ON になっても summary が壊れない）
- ペイントするように Phase 1 を**再実行する必要あり**（次回チャットで継続）
- 過去にこの隠れバグが顕在化していなかったのは、これまで Supabase に RLS が
  かかっていなかったから（anon でも全テーブル読めた）。RLS なしで運用していた
  ぶん、誰も気付けなかった

### 補足
- 今回の事故により、**「コードが正しい = 設定も正しい」とは限らない**ことを
  改めて学んだ。`defineSecret` の値の妥当性は CI で自動検証できないので、
  デプロイ前に role 確認を手動で踏む運用にすべき
- ルール7「触ると危ないポイント」に Firebase Secret のキー名/値ミスマッチ
  事例を追記（同 RULES.md 更新）

---

## 2026-04-25 [village-tsubasa] RLS 移行 Phase 1 試行 → ロールバック

- `sql/enable_rls_group_a.sql`（17テーブル）を Supabase で適用 → 一時的に RLS ON
- 管理ダッシュボードのカウント0件問題を確認後、即座に DISABLE で全テーブルを
  RLS OFF に戻した
- **22テーブル全て元通り（RLS OFF）の状態で停止中**
- 次回再開時は village-admin の secret 修正済みなので、安全に Phase 1 再実行可能
- 詳細は本日の `[village-admin] Firebase Secret 修正` エントリ参照

## 2026-04-25 [village-tsubasa] RLS 移行 Phase 0 診断実行 + SQL を IF EXISTS で防御化

- Supabase Dashboard で `sql/check_rls_status.sql` の Query 1 を実行
- 結果（public スキーマの全 27 オブジェクト）:
  - **RLS 既に ON（5個）**: `helper_priority`, `process_log`, `receipts`,
    `receipt_categories`, `receipt_audit_log`
  - **RLS OFF（22個）**: schedule 系・service 系・training 系・admin 系・
    notifications・push_subscriptions・helper_master・client_users・
    schedule_web_v(view) など
- 新発見:
  - 🆕 `helper_priority`（既に RLS ON、用途未確認）
  - 🆕 `process_log`（既に RLS ON、用途未確認）
  - ❌ `contracts` 5テーブル（`sql/create_contracts.sql` が Supabase 未適用、
    DB に存在しない）
- 対応:
  - `sql/enable_rls_group_a.sql` の `ALTER TABLE` を全て `ALTER TABLE IF EXISTS`
    に書き換え（contracts 系テーブルが DB に未作成でもエラーにならない）
  - `sql/enable_rls_schedule.sql` も同様に防御化
  - `docs/SUPABASE_SCHEMA.md` §8.6「未文書化テーブル」を新規追加して
    `helper_priority` / `process_log` / receipt_* を記録
- **影響範囲**: ドキュメント + SQL ファイル更新のみ。Supabase への変更は
  Phase 0 の Query 1 のみ（読み取り、副作用なし）

## 2026-04-25 [village-tsubasa] RLS 移行 Phase 2 完了 + Phase 3 SQL DRAFT 解除

- `~/Desktop/user-schedule-app/` の HTML 4ファイル（`schedule.html` /
  `index.html` / `records.html` / `mypage.html`）を grep して anon
  キーで叩いている全テーブルを特定
- 判明したアクセスパターン（詳細は `RLS_MIGRATION_PLAN.md` §5）:
  - `schedule` — schedule.html: SELECT/INSERT/UPDATE/DELETE、records.html: SELECT/UPDATE
  - `schedule_web_v` — schedule.html / records.html: SELECT
  - `notifications` — schedule.html: INSERT（**新発見、Group A → B に変更**）
  - `client_users` — index.html: 操作未確認（**新発見、SUPABASE_SCHEMA 未記載**）
  - `helper_master` — 直接アクセス無し（schedule_web_v JOIN 経由のみ）
- 採用方針: **選択肢A（anon 全許可で警告だけ消す）** を確定
  - 理由: user-schedule-app が WHERE 条件無しで全件取得してクライアント
    側でフィルタしている設計のため、選択肢B（DB 側で利用者ごとに絞る）には
    user-schedule-app の大幅改修が必要
  - 厳密化は Phase 4 で別途検討
- 変更ファイル:
  - `sql/enable_rls_schedule.sql` — DRAFT 解除、選択肢A 確定版（4テーブル対象、検証手順・ロールバック付）
  - `sql/enable_rls_group_a.sql` — `notifications` を除外（コメントで Group B 送りと注記）
  - `docs/RLS_MIGRATION_PLAN.md` — §3 グループ分類更新（Group B に
    `helper_master`/`notifications`/`client_users` 編入）、§4 Phase 2 を
    完了マーク、§5 を呼び出しパターンで埋める
  - `docs/SUPABASE_SCHEMA.md` — §8.5 に `client_users` を新規追加（要調査タグ付き）、更新履歴追記
- **影響範囲**:
  - ドキュメント + SQL ファイル更新のみ。Supabase へは未適用
  - Phase 1 (`enable_rls_group_a.sql` 22 テーブル) と
    Phase 3 (`enable_rls_schedule.sql` 4 テーブル) は両方とも適用準備完了。
    奥原さんの判断で Supabase Dashboard で実行
- **次のアクション**:
  1. `sql/check_rls_status.sql` で現状診断
  2. `sql/enable_rls_group_a.sql` を Run（Phase 1）
  3. 動作確認（Firebase Functions 主要 API・GAS 同期）
  4. `sql/enable_rls_schedule.sql` を Run（Phase 3）
  5. user-schedule-app の閲覧/追加/編集/削除を奥原さん端末で動作確認

## 2026-04-24 [village-tsubasa] RLS 段階移行計画 + Phase 0/1/3 SQL 雛形を追加

- Supabase から `rls_disabled_in_public` / `exposed_sensitive_data` の警告メールが
  届いたことを契機に、段階移行計画を起草
- 新規ドキュメント `docs/RLS_MIGRATION_PLAN.md`（約220行）
  - テーブルを 🟢A（service_role のみ）/ 🟡B（anon 直叩きあり）/ 🟣C（判断保留）の
    3グループに分類
  - Phase 0（診断）→ Phase 1（グループA の RLS ON）→ Phase 2（user-schedule-app
    コード調査）→ Phase 3（グループB の RLS ON）→ Phase 4（厳密化・任意）
  - ロールバック手順と「一括 RLS ON で何が壊れるか」を明記
- 新規 SQL 3本（いずれも適用は奥原さんが Supabase Dashboard で実行予定）:
  - `sql/check_rls_status.sql` — Phase 0 用。全テーブルの RLS 状態・既存ポリシー・
    anon/authenticated GRANT・センシティブ列候補を一覧
  - `sql/enable_rls_group_a.sql` — Phase 1 用。service_role 限定の 23 テーブルを
    `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`（ポリシー無し、service_role が
    bypass するため Firebase Functions / GAS は通常動作）
  - `sql/enable_rls_schedule.sql` — Phase 3 用。**DRAFT 状態**（選択肢A「anon
    全許可で警告だけ消す」/ 選択肢B「beneficiary_number で絞る厳格案」の2案を
    コメントアウトで併記、user-schedule-app のコード確認後に採用案を確定）
- **影響範囲**:
  - ドキュメント + SQL ファイル追加のみ。まだ Supabase へは適用していない
  - Phase 1 を適用するとグループA 23 テーブルの anon/authenticated 直アクセスが
    拒否されるが、現時点で anon から叩いているアプリは user-schedule-app のみで、
    user-schedule-app は `schedule` / `schedule_web_v` / `helper_master` しか
    触らないため、Phase 1 単独では他アプリに影響なし想定
  - Phase 3 は user-schedule-app の実コード確認とポリシー設計レビュー後に適用
- 関連ドキュメント: `docs/RLS_MIGRATION_PLAN.md`

## 2026-04-21 [village-tsubasa] FUTURE_IDEAS.md とルール10（アイデア蓄積の自動化）を追加

- `docs/FUTURE_IDEAS.md` を新規作成（80行）
  - 3セクション構成: 🧠 即席メモ / 📝 正式エントリ / 🗄️ 却下アーカイブ
  - 初版として 2026-04-21 の即席メモ 5件 + 正式エントリ 1件（「福祉業界向け IT オールインワン」構想、1年後に大田区の福祉事業者への提供を目指す中期ビジョン）
- `docs/RULES.md` にルール10「アイデア蓄積の自動化」追加（41行）
  - 奥原翼さんは自由に話すだけ、Claude が検出→整理→追記の役割分担
  - 軽い思いつきは 🧠 即席メモに、構造化できる構想は 📝 正式エントリに
  - 意図が曖昧な場合は Claude が質問して言語化を助けてから追記
  - 追記は都度告知せず、チャット終わりにまとめて 1 コミット
  - 月1回の定期見直しで「昇格」「却下アーカイブ行き」を奥原さんが判断
- **影響範囲**: 新規ドキュメント + ドキュメント追記のみ。コード・API・Supabase・他アプリへの影響なし
- 関連コミット: `a9493c9`

## 2026-04-21 [village-tsubasa] リポジトリ健康診断スクリプト追加 + RULES.md ルール9

- `scripts/repo-health-check.sh` を新規追加（130 行、bash）
  - `~/Desktop` / `~/Documents` / `~/dev` / `~/Projects` 配下の git リポを自動検出
  - 🟢 健全 / 🟡 注意 / 🔴 危険 の3段階で判定
  - サマリと対応推奨メッセージを最後に表示
  - `--quiet` オプションで 🟢 を非表示化
- `docs/RULES.md` に「ルール9. 週次のリポジトリ健康診断」を追加
  - 実行推奨タイミング（毎週金曜 or 週初め）
  - 運用ポリシー（🔴 は今週中対応、2週連続 🔴 は整理候補）
- 背景: 4/19 の `main.js` 354行ロスト未遂（Firebase Deploy 済みだが git HEAD 空ファイル）と 4/21 の Desktop 整理で見つかった重複/孤立リポ多数の反省
- **影響範囲**: 新規スクリプト + ドキュメント追記のみ。コード・API・Supabase・他アプリへの影響なし
- 関連コミット: `a1034ef`

## 2026-04-20 [village-tsubasa] training-reports に「✅ 報告済み」バッジを追加

- 研修報告を送信した直後、その資料カードに緑色の「✅ 報告済み」バッジを表示。カード自体も淡い緑系のスタイルに変えてヘルパーの達成感と確認をサポート
- セッション内変数 `reportedMaterialIds = {}` で記録（ページリロードでリセット、サーバー永続化なし）
- 送信成功ハンドラに `reportedMaterialIds[selectedMaterial.id] = true` を `clearReportForm()` より先に実行
- `renderMaterialList()` でバッジ HTML + `.reported` クラスを差し込み
- **影響範囲**: training-reports の UI のみ。既存挙動・API・Supabase・他アプリへの影響なし
- 関連コミット: `c984b03`

## 2026-04-19 [village-tsubasa] training-reports 送信失敗時のみ「声のポストに切替」ボタンを追加

- ヘルパー研修報告画面 (`/training-reports/`) で送信失敗時 (API エラー or 通信エラー) に黄色のフォールバック案内 + 緑の「📢 声のポストで報告する」ボタンを表示
- 成功時は既存の "ありがとうございました" メッセージのみ（変更なし）
- `/feedback/` への遷移はフレッシュなフォーム（引き継ぎ情報なし）
- 再送信を始めると自動でフォールバック案内は消える（前回エラー残骸の掃除）
- **影響範囲**: training-reports の UI のみ追加。API / Supabase / 他アプリへの影響なし。`/feedback/` ページ自体は無変更
- 関連コミット: `5a8305d`

## 2026-04-19 [village-tsubasa] training-reports の二重送信防止 + デザインリニューアルを git に取り込み

- これまで Firebase Hosting にはデプロイ済みだったが、`public/training-reports/main.js` が git HEAD 上で空ファイル (`e69de29`) のままだった既存改修を正式登録
- main.js (354行) を新規実装として登録: メールアドレス確認 + localStorage 記憶 / 研修資料一覧 / チェック項目 + 感想3欄 / **isSubmitting フラグ + submitBtn.disabled の二重ガード** / 送信中オーバーレイ
- index.html: 全画面のデザインを village-tsubasa 標準パレット (`#d5bb93` 系) に揃え、共通の「← ビレッジひろばに戻る」ブラウンボタンを採用
- **影響範囲**: API 仕様変更なし、village-admin / user-schedule-app への影響なし。既に Firebase 上で実機動作確認済み（二重送信問題は再現せず）
- 関連コミット: `5207650`

## 2026-04-19 [village-tsubasa] 電子契約ドキュメントの業種訂正（介護事業 → 障害福祉サービス事業）

- 履歴事項全部証明書で登記上の事業目的を確認した結果、実態は **障害者総合支援法・児童福祉法に基づく障害福祉サービス事業**（合同会社つばさ）と判明
- 初稿で「介護事業／訪問介護」前提にしていた以下3点を訂正:
  - `docs/CONTRACTS_PHASE0.md` 冒頭に訂正バナーを追記（本文は読み替え運用）
  - `docs/CONTRACTS_DESIGN.md` 冒頭に訂正バナーを追記（本文は読み替え運用）
  - `docs/CONTRACTS_VENDOR_INQUIRY.md` は全面改訂（業種・会社情報・短文テンプレートを正しい内容に差し替え）
- **設計・DB・API・コードには影響なし**。根拠法と参照する国定型様式（重要事項説明書等）が「介護保険法関係」→「障害者総合支援法関係」に変わる点だけ Phase 3.2 以降で反映必要
- 関連: 会社情報（合同会社つばさ／東京都大田区／代表社員 奥原翼／ヘルパー25〜30名／利用者110〜130名）を VENDOR_INQUIRY.md に反映
- 影響範囲: 本リポ内ドキュメントのみ。他アプリ・コード・Supabase・Firebase には影響なし

## 2026-04-19 [village-tsubasa] 電子契約機能 Phase 0〜4 雛形の追加

- ハイブリッド構成（自社UI + 外部署名API）で電子契約機能を既存アプリに統合する方針。別アプリは作らない
- **Phase 0 方針メモ**: `docs/CONTRACTS_PHASE0.md`（GMOサイン vs クラウドサイン比較、介護業界固有論点、MVPスコープ）
  - 第一候補 = クラウドサイン（SwaggerHub 仕様公開、トークン取得が単純）、GMOサインは後追いで並行評価
- **Phase 1 設計書**: `docs/CONTRACTS_DESIGN.md`（DB ER図・API一覧・状態遷移・画面設計・provider抽象層）
- **Phase 2 SQL**: `sql/create_contracts.sql` — 新規5テーブル（`contracts` / `contract_templates` / `contract_parties` / `contract_signatures` / `contract_audit_log`）
- **Phase 3 Functions 雛形**: `functions/src/contracts/` （router / handlers / services / providers）
  - `functions/src/index.ts` に `app.use("/contracts", contractsRouter)` と `app.use("/api/contracts", contractsRouter)` を追加（15エンドポイント）
  - テンプレート CRUD・契約 CRUD・一覧・監査ログは動作。送信／ダウンロード／署名URL発行／Webhook 本処理は **Phase 3.2 以降に実装**（現状 501 スタブ）
- **Phase 4 UI 雛形**: `public/contracts/index.html` / `sign.html` / `viewer.html`（ヘルパー向け「雇用契約」タブ）
  - **利用者側（user-schedule-app）の UI は基盤優先方針に基づき未着手**
  - **管理者側（village-admin）の契約管理画面も未着手**
- MVP対象: ①ヘルパー雇用契約（★最優先）、②事業所間 業務委託・秘密保持（★）、③利用者 重要事項説明書・契約書は国定型様式／代理人署名あり（★基盤のみ）
- **影響範囲**:
  - 既存テーブル変更なし（RULES ルール2 準拠）
  - `helper_master` / `notifications` / `admin_users` は SELECT or 既存列のみ参照（RULES ルール4 準拠）
  - 既存 API の破壊的変更なし（RULES ルール3 準拠）。新規エンドポイント追加のみ
  - user-schedule-app の `schedule` 呼び出しには触らない（RULES ルール6 準拠）
  - Firebase Functions Secret Manager に `CLOUDSIGN_CLIENT_ID` / `CLOUDSIGN_WEBHOOK_SECRET` を **後日追加予定**（Phase 3.2 着手時）。現時点ではスタブが到達前に 501 を返すためデプロイ可
- **次のアクション**: Phase 3.2 で `providers/cloudsign.ts` の実装 → `handleSendContract` 実装 → Webhook 本処理 → 結合試験 → 1件目のリアル雇用契約を電子化
- 関連ドキュメント: `functions/src/contracts/README.md`（モジュール構成と動作状況の一覧）

## 2026-04-19 [village-tsubasa] 経費精算アプリに「⌨️ 手入力」ページを追加（テンキー風 + エクセル風 2 タブ）

- レシート画像を使わずに手入力で登録したいヘルパー向けの新ページ
- サイドバーに「⌨️ 手入力」を追加。既存「📝 レシート登録」（画像+AI）はそのまま残す
- ページ内 2 タブ:
  - **⌨️ テンキー風**: マネーフォワード風 3×4 キーパッドで 1 件ずつ入力。C/⌫ 付き、上限 9 桁
  - **📊 エクセル風**: `st.data_editor` で複数行一括入力。金額0 / 費目空はスキップ、登録件数・合計のプレビュー
- `database.py` の `insert_receipt` を画像引数すべて Optional (default None) に変更。画像なしでも呼べるように
- 電子帳簿保存法の注意書き（手入力モードはスキャナ保存要件外、紙レシートは別途保管）を画面上部に表示
- **影響範囲**:
  - village-tsubasa (Firebase) 側には一切変更なし
  - Supabase 既存テーブル `receipts` の列定義変更なし（`image_*` 列は元々 NULL 可）
  - 既存ページの挙動・既存 API の signature 互換性ともに変更なし
- 関連コミット: `bb725ca`

## 2026-04-19 [village-tsubasa] 経費精算 Streamlit アプリのソースを main に追加（`v-sche-receipt.streamlit.app` 復旧）

- Streamlit Cloud の「v-sche-receipt」アプリが `The main module file does not exist: /mount/src/village-tsubasa/app.py` で起動失敗していた
- 原因: Streamlit Cloud が village-tsubasa リポの main ブランチから `app.py` を起動しようとしていたが、main に未コミットだった（ローカルのみに存在）
- 対応: 追加だけのコミット (`1e37463`) を作成。Firebase 側のファイル削除や変更はステージから完全に除外
- 追加ファイル（10）:
  - `app.py`, `database.py`, `image_utils.py`, `ocr_utils.py` — Streamlit 経費精算アプリ本体
  - `requirements.txt` — streamlit / Pillow / pandas / openpyxl / anthropic / supabase
  - `supabase_schema.sql`, `supabase_migration_ai_fields.sql`, `supabase_migration_multiuser.sql` — DB スキーマ（全テーブル `receipt_` プレフィックスで既存と衝突回避）
  - `.streamlit/secrets.toml.example` — Cloud Secrets 設定用テンプレ
  - `.gitignore` — Streamlit / Python 用パターン追記（既存 Firebase パターンは維持）
- **影響範囲**:
  - village-tsubasa (Firebase) の本体コード・API・画面には一切変更なし
  - Supabase 共有プロジェクトに **新規テーブル（`receipts` / `receipt_audit_log` / `receipt_categories`）を追加する前提**。既存テーブルの変更はなし → RULES.md ルール2・4 に準拠
  - `helper_master` テーブルは READ のみ（`sign_up_helper` のホワイトリストチェックと `sign_in_helper` の名前引き）。INSERT/UPDATE はしない
- 稼働条件: Streamlit Cloud Secrets に `[supabase] url/key` (service_role) / `[anthropic] api_key` / `[admin] emails` / `[auth] password` の設定が必要
- push は奥原さんが確認してから実施

## 2026-04-18 [village-tsubasa] 研修資料テーブル追加（`training_materials`）

- `training_materials` テーブルを新設（`sql/create_training_materials.sql`）
- `training_reports` に3列追加: `training_material_id` (uuid fk), `checklist_answers` (jsonb), `extra_comments` (jsonb)
- AI（gpt-4o-mini）がチェック5項目を自動生成、管理者が編集可
- 本文抽出は **ブラウザ側の mammoth.js** で行い、サーバーには抽出済みテキストのみ送信（cold start 軽量化）
- 新 API: `POST/GET /api/training-materials`, `GET /api/training-materials/:id`, `POST /api/training-materials/update`, `POST /api/training-materials/delete`
- **影響範囲**: `training_reports` の新規列はすべて nullable なので、village-admin 側が既存 SELECT 文で引いても破壊的影響なし。admin 側が研修資料を一覧したい場合は新 API を叩く。
- 関連: `docs/HANDOFF_TRAINING_SYSTEM.md`

## 2026-04-18 [village-tsubasa] 横断連携ドキュメント整備

- `docs/CURRENT_STATE.md` 初版作成（3アプリの API・画面 URL・Scheduler ジョブの横断ビュー）
- `docs/CHANGELOG.md` 初版作成（本ファイル）
- `docs/RULES.md` 初版作成（新チャットが最初に読むルール）
- 既存の `docs/SUPABASE_SCHEMA.md` を「共有契約の正」として位置付け
- **影響範囲**: コード変更なし。3リポの新チャット開始時プロトコルが変わる。

## 2026-04-18 [docs] CURRENT_STATE.md Section 3 拡張（村上翼さん変更の反映）

- `docs/CHANGELOG.md` の「village-admin リポの変更（転記）」に **2026-04-18 [village-admin] 研修管理画面の追加** を転記（新規画面 `/training.html`、village-tsubasa の training 系 API 8本を消費）
- `docs/CURRENT_STATE.md` Section 3（village-admin）を拡張:
  - 画面一覧表を追加（既存6画面 + 新規 `/training.html`）
  - 「village-tsubasa API の消費」段落を追加: **研修系 API の破壊的変更は admin `/training.html` を壊す** 旨を明示（RULES ルール3 と連動）
- **影響範囲**: ドキュメントのみ。コード・スキーマ・API 変更なし
- 追記タイミング: 実施は 2026-04-18 夕方、記録は 2026-04-19（作業後に RULES ルール5 の適用範囲を再検討して、横断参照の足跡として残すべきと判断）

## 2026-04-17 [village-tsubasa] `schedule` テーブルに同期フラグ列追加

- `schedule` に `synced_to_sheet` (boolean, default false) / `synced_at` (timestamptz, nullable) を追加
- GAS 「スケジュール逆同期」に `monthlySheetAutoCreate_` / `flushScheduleToSheet_` / `installMonthlyTrigger_` 追加
  - 毎月15日 00:05 に翌月週シート自動生成 + Supabase 未反映分の流し込み
- `sheet_auto_create.gs` は **「シート状態ベース版」** で実装（PostgREST キャッシュ問題で列書き込みが不安定だったため、`synced_to_sheet` 列は現状使用していない）
- スプレッドシートの `SUPABASE_ID` 列位置を **Q列 (offset 13) → W列 (offset 19)** に変更
- GAS スクリプトプロパティの `SUPABASE_URL` が別プロジェクト (`xwnbdlcukycihgfrfcox`) を指していた事故を発見、正しい `pbqqqwwgswniuomjlhsh` の service_role キーに修正
- **影響範囲**: `schedule` の新規2列は nullable/default あり → user-schedule-app / village-admin の既存クエリは破壊的影響なし。GAS 側のシート列位置変更は「スケジュール逆同期」プロジェクトに閉じた変更。
- 関連コミット: `ab4e1a2`, `b78cb5c`, `9555528`

## 2026-04-14 [village-tsubasa] 落ち着き確認システム（calm check）追加

- 新テーブル2つ: `calm_check_targets` / `calm_checks`（`sql/create_calm_checks.sql`）
- 新 API 7つ: `/api/calm-checks/pending`, `/answer`, `/generate`, `/history`, `/targets`, `/targets` (POST), `/targets/remove`
- 新画面: `public/calm-check/`
- ホーム画面 (`public/index.js`) で pending 件数を取得し、連絡確認カード内にアラート表示
- **影響範囲**: 新規テーブルのみで既存テーブルに変更なし → 他アプリへの影響なし。
- 関連コミット: `98435bc`

## 2026-04-07〜2026-04-14 [village-tsubasa] カレンダー連携・サービス記録GAS連携

- `feat: カレンダー連携（Google推奨・iPhone対応・一括追加）` (`ae12bc1`)
- `feat: カレンダー追加の重複防止機能` (`9193a4e`)
- サービス記録転送GASコード追加（4コミット連続）
- **影響範囲**: 本リポ内 + GAS。他アプリへの影響なし。

## 2026-04-06 [village-tsubasa] 通知UIとcron修正

- Scheduler の cron 式を **JST基準に修正**（7時/20時）(`f4cf552`)
- 戻るボタン追加・通知色分けデプロイ・ステータス資料作成 (`0156a1e`)
- 通知一覧の通知タイプ別に色分けを追加 (`fe48b63`)
- 予定カードから概要欄を非表示に (`c0e1379`)
- **影響範囲**: 本リポ内のみ。

## 2026-04-04〜2026-04-05 [village-tsubasa] スケジュール通知機能 + helper_email ilike化

- スケジュール通知機能の追加 (`71d0818`)
- `helper_email` の比較を `ilike`（大文字小文字無視）に変更 — `07b06ab` ほか複数
- schedule_web_v で helper_email 自動補完、localStorage 記憶 (`b78cb5c`)
- **影響範囲**: API レスポンスのフィルタ条件が変わったため、既存のメールアドレスをたとえば `"Admin@..."` と `"admin@..."` で使い分けていたクライアントは挙動が変わる可能性。user-schedule-app / village-admin からの影響は無いはず。

## 2026-04-02 [village-tsubasa] ヘルパー選択 UI 改修

- ヘルパー選択: 人名でない項目をその他グループに分離 (`25f6b8f`)
- ヘルパー選択を個別名に分割して表示 (`d8c8299`)
- メール検索を `ilike`（大文字小文字無視）に変更 (`4896cb7`)
- 移動サービス記録: `haisha` 列を select から削除（列が存在しないため）(`83e135d`)
- **影響範囲**: 本リポ内のみ。

## 2026-03-31 [village-tsubasa] サービス記録のAI要約フォールバック改善

- 移動支援・居宅介護: AI要約フォールバック時に警告表示を追加 (`103bb25`, #7)
- スケジュール同期: API失敗時のモックデータ表示に警告バナーを追加 (`eb56560`, #6)
- service-worker のデバッグ log 削除 (`51efba9`, `1e16050`, #11)
- 移動支援未記録一覧: `haisha` フィールドをDBから正しく取得するよう修正 (`7c60407`)
- 移動支援・居宅介護記録: モデル名修正とロールバック処理追加 (`8d06992`)
- 移動支援記録: OpenAI要約生成と保存失敗時の再試行導線を実装 (`c316e79`)
- **影響範囲**: 本リポ内のみ。

## 2026-03-29〜2026-03-30 [village-tsubasa] ホーム画面・構造化記録・SQL 整備

- `feat: helper home, next schedule, push badge, schedule view and sql setup` (`181f088`)
- `docs: add supabase sql setup files for helper home, schedule view, and notification tests` (`d7f3a0c`)
- `feat: group same schedule items in schedule sync view` (`b351a62`)
- Home summary route / require AI before save (`91c083d`)
- Enhance home structured logs and save flow (`7417af0`)
- Home summary generation and function packaging fix (`a8a3f5d`)
- **影響範囲**: 本リポ内が中心。`schedule_web_v` の形式変更は他アプリの SELECT 文に影響しうるが、カラム削除はしていないので後方互換あり。

## 2026-03-26 [village-tsubasa] AI要約 + アプリ内通知

- Add AI summary generation for home service records (`99a1a5b`)
- Add in-app notifications and schedule improvements (`27484eb`)
- **影響範囲**: 本リポ内のみ。`notifications` テーブルは本リポ専用。

---

## village-admin リポの変更（転記）

> 村上翼さんのチャットで村上さん側に変更があったら、ここに転記してください。
> 現状、別リポジトリの git log はこのチャットからは直接追えないため、手動追記待ち。

### 2026-04-18 [village-admin] 研修管理画面の追加

**変更内容**
- 新規ページ `/training.html` を追加。2サブタブ構成で研修資料と研修報告を1画面に集約
  - タブ1「📚 研修資料マスタ」— 一覧表示（停止中トグル）／新規登録モーダル（.docx アップロード→ブラウザで mammoth.js 抽出→本文反映／「ヘルパーへ自動通知」チェック）／学習チェック項目編集モーダル（最大10個）／基本情報の編集／停止・再開／完全削除
  - タブ2「📝 研修報告・お知らせ一覧」— フィルタチップ（状態：全て/未読/既読/完了、種別：全て/ヘルパー報告/お知らせ、資料連携フィルタ）／AI整形文＋元文トグル／学習チェック達成率表示（✓✗付き%表示）／感想3コメント／既読・完了・未読戻し・削除
  - サブタブに未読件数バッジ、資料カードの「報告を見る →」からタブ＆資料フィルタを連動
- ダッシュボード（`/`）に stat-card「未読研修報告」を追加。件数表示＋未読時に警告色、クリックで `/training.html#reports` へ遷移。30秒ポーリングに組込
- 全6ページ（index / schedule / search / service-notes-move / service-notes-home / helper-qualification）のナビに「研修」リンクを追加
- `public/style.css` に研修画面用スタイル一式を追記

**呼び出した village-tsubasa API**
- `GET  /api/training-materials?email=...&includeInactive=1`
- `POST /api/training-materials` — 新規登録
- `POST /api/training-materials/update` — 基本情報編集／チェック項目編集／停止・再開
- `POST /api/training-materials/delete` — 完全削除
- `GET  /api/training-reports?email=...&status=...&type=...`
- `POST /api/training-reports/notice` — 資料登録時のヘルパーへの通知自動投稿
- `POST /api/training-reports/update-status` — 既読／完了／未読戻し
- `POST /api/training-reports/delete`
- ダッシュボードから未読件数取得にも `GET /api/training-reports?status=unread` を使用

**影響範囲**: village-admin 内のみ。Supabase スキーマへの変更なし。village-tsubasa 側の既存 API を呼び出すだけで、API 仕様の変更なし。

**動作確認の状況**: TS ビルド OK / 構文チェック OK / API マッピング OK。ローカル UI 動作確認・本番デプロイは未実施。

---

## user-schedule-app リポの変更（転記）

> user-schedule-app 側に変更があったら、ここに転記してください。
> 特に `schedule.html` の INSERT/UPDATE/DELETE 呼び出しが変わる場合は要転記。

（未記入）

---

## 未記入の過去変更（SUPABASE_SCHEMA.md の更新履歴から転記）

- **2026-04-13** [village-tsubasa] `training_reports` テーブル追加（研修報告 + 管理者お知らせ統合）。CREATE 文: `sql/create_training_reports.sql`。**影響範囲**: 新規テーブル、既存影響なし
- **2026-04-11** `SUPABASE_SCHEMA.md` 初版作成（村上翼さん）
- **2026-04-11** `SUPABASE_SCHEMA.md` に `schedule` テーブルの列定義・RLS 注意点を追記（村上翼 / village-admin チャットからの情報反映）
- **2026-04-11** `SUPABASE_SCHEMA.md` に move / home 系（`schedule_tasks_move`, `service_notes_move`, `move_check_logs`, `home_schedule_tasks`, `service_notes_home`, `service_action_logs_home`）を詳細化
- **2026-04-11** `SUPABASE_SCHEMA.md` に village-admin 調査結果を反映（`sent_at`, `memo`/`final_note` の独自フォーマット、`schedule_tasks_move` のバグ疑い、`admin_users` / `admin_error_alerts`）
