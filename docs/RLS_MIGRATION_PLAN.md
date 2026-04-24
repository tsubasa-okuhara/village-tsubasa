# RLS 段階移行計画

> Supabase から届いた `rls_disabled_in_public` / `exposed_sensitive_data` 警告への
> 対応計画。ワンクリック一括 RLS ON は user-schedule-app（116名配布済）を
> 即座に破壊するため、テーブルをリスク別に3グループへ分類し、段階的に ON にする。

最終更新: 2026-04-24
起草者: 奥原翼 + Claude Opus（本計画）

---

## 0. 位置付け

- 本ドキュメントは **移行ロードマップ**。計画のみで、実行は奥原さんが
  Supabase ダッシュボード or `sql/` 配下の migration を適用する形で行う
- 実行済みフェーズは `CHANGELOG.md` に追記、テーブルの状態は
  `SUPABASE_SCHEMA.md` の各テーブル節と「§11 要確認 / TODO」に反映する
- 本計画自体の更新は末尾「更新履歴」に追記

## 1. 背景と現状

### 1.1 Supabase 警告の内容（2026-04-13 時点）

- **`rls_disabled_in_public`**: プロジェクト URL を知っている人なら誰でも
  テーブル内の全データを読み書き削除できる
- **`exposed_sensitive_data`**: PII を含みうる列が API 経由で無制限に読める

### 1.2 影響対象

対象プロジェクト: `pbqqqwwgswniuomjlhsh.supabase.co`（村のつばさ）

プロジェクトは介護・福祉事業所のデータを扱っており、以下の**高機微情報**を含む:

- 利用者名・受給者証番号（`schedule.client` / `schedule.beneficiary_number` ほか）
- 居宅介護の詳細記録（`service_notes_home.memo` / `final_note`）
- 落ち着き確認（`calm_checks.is_calm` / `severity` / `memo`）
- ヘルパー研修報告（`training_reports.original_comment`）
- 雇用契約データ（`contracts` 5テーブル）
- ヘルパーメール・名前（`helper_master`）

### 1.3 既知の制約

- **user-schedule-app は anon キーで Supabase を直接叩く**（116名配布済み）
  - 対象テーブル: `schedule`（INSERT/UPDATE/DELETE/SELECT）
  - `schedule_web_v` ビューも間接的に依存（`helper_master` 補完元）
- **village-tsubasa / village-admin の Firebase Functions は service_role キー**
  を使うので RLS は bypass される（ポリシーなしでも通る）
- **GAS（スケジュール逆同期 / 全体スケジュール）も service_role キー** を
  `SUPABASE_SERVICE_KEY` スクリプトプロパティから使用

---

## 2. 絶対にやってはいけない対処

- Supabase ダッシュボードの「**問題を解決する**」ボタンで一括 RLS ON
  - → `schedule` が即座に anon から遮断され、**利用者 116 名全員の
    スケジュール画面が空になる**
- `schedule` テーブルへのポリシー設計なしでの RLS ON
  - → user-schedule-app の `doAdd` / `doEdit` / `doCancel` / `doSubmit`
    が全て 401/403 で落ちる

---

## 3. テーブル分類（3グループ）

### 🟢 グループA: service_role のみアクセス — **即 RLS ON 可能**

Firebase Functions（service_role）からしか読み書きされず、anon からの
直アクセスが理論上ゼロのテーブル。RLS ON + ポリシー無し で安全:

| テーブル | 参照元 | 備考 |
|---|---|---|
| `schedule_tasks_move` | village-tsubasa / village-admin の Functions | |
| `service_notes_move` | 同上 | |
| `move_check_logs` | village-tsubasa Functions | |
| `home_schedule_tasks` | village-tsubasa / village-admin Functions | |
| `service_notes_home` | 同上 | `memo` / `final_note` 独自フォーマット |
| `service_action_logs_home` | village-tsubasa Functions | |
| `service_record_structured` | village-tsubasa Functions | |
| `service_action_logs` | 同上 | |
| `service_irregular_events` | 同上 | |
| `training_reports` | village-tsubasa / village-admin Functions | |
| `training_materials` | 同上 | |
| `calm_checks` | village-tsubasa Functions | |
| `calm_check_targets` | 同上 | |
| `anonymous_feedback` | village-tsubasa Functions | |
| `notifications` | 同上 | |
| `push_subscriptions` | 同上 | |
| `contracts` | 同上（Phase 3 雛形） | |
| `contract_templates` | 同上 | |
| `contract_parties` | 同上 | |
| `contract_signatures` | 同上 | |
| `contract_audit_log` | 同上 | |
| `admin_users` | village-admin Functions | |
| `admin_error_alerts` | 同上 | |

**実行 SQL**: `sql/enable_rls_group_a.sql`

**ロールバック**: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`

---

### 🟡 グループB: anon 直叩きあり — **ポリシー設計してから ON**

user-schedule-app が anon キーで直接叩くテーブル。先にポリシーを整備:

| テーブル/ビュー | anon アクセスパターン | 備考 |
|---|---|---|
| `schedule` | user-schedule-app の `schedule.html` で `loadSchedule`（SELECT）、`doAdd`（INSERT）、`doEdit`（UPDATE）、`doCancel`/`doSubmit`（DELETE/UPSERT） | 本丸 |
| `schedule_web_v` | village-tsubasa Functions のみ（service_role） | ビュー。`schedule` + `helper_master` の RLS を継承 |
| `helper_master` | user-schedule-app の SELECT？ → **要確認**（グループC候補） | `schedule_web_v` の補完元 |

**実行 SQL**: `sql/enable_rls_schedule.sql`（Phase 2 で起草、未作成）

**前提作業**:
1. user-schedule-app の `schedule.html` のコードを取得し、Supabase JS
   client への呼び出しパターンを一覧化
2. WHERE 条件（例: `beneficiary_number.eq.〇〇`、`date.gte.〇〇` 等）から
   ポリシーを設計
3. **現状は利用者が他人の予定も閲覧・編集できる理論上の経路あり**。
   これを塞ぐかは別論点（RLS ON とセットで議論）

**ロールバック**: `DROP POLICY ...; ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`

---

### 🟣 グループC: 判断保留

| テーブル | 要確認事項 |
|---|---|
| `helper_master` | user-schedule-app から SELECT しているか？していなければ A に降格 |
| `clients` | 存在するか？（`calm_check_targets.client_id` が参照している）CREATE 文未確認 |

---

## 4. 段階的タイムライン

### Phase 0（2026-04-24〜）: 現状診断

- `sql/check_rls_status.sql` を Supabase SQL Editor で実行
  - 全テーブルの `rowsecurity` フラグを一覧化
  - 既存ポリシー（`pg_policies`）も一覧
- 結果を `CHANGELOG.md` に残す

### Phase 1（Phase 0 翌日〜1週間以内）: グループA の RLS ON

- `sql/enable_rls_group_a.sql` を Supabase SQL Editor で実行
- **適用後の確認事項**:
  - village-tsubasa の Firebase Functions が通常通り動くか
    （`/api/today-schedule` 等を叩いて確認）
  - village-admin のダッシュボードが 30秒ポーリングで数字を引けるか
  - GAS「スケジュール逆同期」が通常通り動くか（手動実行で確認）
- 問題があればロールバック SQL で即戻し
- `CHANGELOG.md` + `SUPABASE_SCHEMA.md` 更新

### Phase 2（Phase 1 後、1〜2週間）: user-schedule-app 調査とポリシー設計

- user-schedule-app の `schedule.html` のソースを取得
- Supabase クライアント呼び出しを一覧化（本ドキュメント §5 に追記）
- ポリシー SQL を `sql/enable_rls_schedule.sql` として起草
- **奥原さんにレビュー依頼してから適用**

### Phase 3（Phase 2 レビュー OK 後）: グループB の RLS ON

- `sql/enable_rls_schedule.sql` を平日午前の静かな時間帯に適用
- **適用直後の確認事項**:
  - 奥原さんの端末で user-schedule-app の閲覧・追加・編集・削除が
    anon キーで通るか
  - Firebase Functions の `/api/schedule-list` 等が通常通り動くか
  - GAS の双方向同期が通るか
- 問題があれば即ロールバック
- `CHANGELOG.md` + `SUPABASE_SCHEMA.md` 更新

### Phase 4（任意）: グループC の判断と、より厳密なポリシー

- `helper_master` を A に降格 or B 相当のポリシー追加
- user-schedule-app で「他人の予定を覗けてしまう」経路を塞ぐか議論
  - 塞ぐ → 利用者ごとに `beneficiary_number` を localStorage で持たせて
    ポリシーで絞る（既に実装されていれば不要）
  - 塞がない → 現状維持（善管注意義務の運用でカバー）

---

## 5. user-schedule-app 呼び出しパターン（Phase 2 で埋める）

> このセクションは Phase 2 で user-schedule-app のコードを取得してから埋める。
> 現時点では空欄。

### 5.1 SELECT
- （未調査）

### 5.2 INSERT
- （未調査）

### 5.3 UPDATE
- （未調査）

### 5.4 DELETE
- （未調査）

---

## 6. ロールバック手順（共通）

全グループ共通で、RLS を戻したい場合:

```sql
-- 1) ポリシーを全て削除（グループB 以降のみ）
DROP POLICY IF EXISTS <policy_name> ON <table_name>;

-- 2) RLS を無効化
ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
```

Supabase ダッシュボード上でも Authentication → Policies → 該当テーブルで
RLS トグルを OFF にできる。

**重要**: service_role キーは RLS を bypass するため、ロールバック中も
Firebase Functions と GAS は通常動作する。影響を受けるのは anon の利用者
アプリだけ。

---

## 7. Supabase RLS の基礎メモ

- RLS ON にすると **全ての** anon/authenticated リクエストはポリシーが
  必要になる（ポリシーがなければ全拒否）
- service_role キーは常に RLS を bypass
- Supabase ダッシュボード上で SQL Editor は service_role 扱いなので、
  ダッシュボードから見ると RLS ON でもデータが見えてしまう（混乱注意）
- 検証は必ず **anon キーで叩ける URL（user-schedule-app 本体や curl）** で行う

参考: <https://supabase.com/docs/guides/database/postgres/row-level-security>

---

## 更新履歴

- **2026-04-24** 初版作成（奥原翼 + Claude Opus）。Supabase の
  `rls_disabled_in_public` / `exposed_sensitive_data` 警告メールを契機に起草
