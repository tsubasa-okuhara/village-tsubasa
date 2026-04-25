# RLS 段階移行計画

> Supabase から届いた `rls_disabled_in_public` / `exposed_sensitive_data` 警告への
> 対応計画。ワンクリック一括 RLS ON は user-schedule-app（116名配布済）を
> 即座に破壊するため、テーブルをリスク別に3グループへ分類し、段階的に ON にする。

最終更新: 2026-04-25 夕刻（Phase 1 試行→ロールバック→隠れバグ修正→未再実行で停止中）
起草者: 奥原翼 + Claude Opus（本計画）

## 🚨 再開時のメモ（次のチャット最初に読む）

### 現在の状態（2026-04-25 終了時点）
- ✅ Phase 0（診断）完了 — 全 27 オブジェクトの状態把握済み
- ⚠️ Phase 1（Group A 17テーブル RLS ON）: **一度試して即ロールバック**
- ✅ village-admin の Firebase Secret 修正済み（anon → service_role）
- ✅ village-admin Functions 再デプロイ完了（service_role 反映済み）
- ⏸️ Phase 1 を**まだ再実行していない**（Supabase は全テーブル RLS OFF のまま、
  警告メールが残っている状態）
- ⏸️ Phase 3（schedule 系 4テーブル）も未実行

### 再開時にやること（順番厳守）

1. **管理ダッシュボードの正常確認**
   - `https://village-admin-bd316.web.app/` を開いて未記録/完成カウントが
     ちゃんと数字で出ているか確認（0件のはずがない）
   - これは前回の修正後の状態を再チェック

2. **Phase 1 再実行**
   - Supabase SQL Editor で `sql/enable_rls_group_a.sql` の中身を Run
   - 「Success. No rows returned」を確認

3. **動作確認3点セット**
   - ✅ 管理ダッシュボード `https://village-admin-bd316.web.app/`
     カウントが正常に出るか（**前回はここで0件になった**）
   - ✅ ヘルパー今日の予定 `https://village-tsubasa.web.app/today-schedule/`
   - ✅ ヘルパーホーム `https://village-tsubasa.web.app/`

4. **Phase 3 へ進む**
   - 上3つ全部 OK なら `sql/enable_rls_schedule.sql` を Run
   - その後 user-schedule-app の動作確認:
     `https://tsubasa-okuhara.github.io/user-schedule-app/schedule.html`

### もしまた管理ダッシュボードが壊れたら

- **慌てずロールバック**: `CHANGELOG.md` 2026-04-25 のロールバック SQL を参照
- 原因の追加調査（Firebase Secret 以外にも anon キー使用箇所が無いか）
- 当面は妥協案として `enable_rls_schedule.sql` の選択肢A を全テーブルに適用する選択も

---


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

### 🟡 グループB: anon 直叩きあり — **anon 全許可ポリシーを付けて ON**

user-schedule-app が anon キーで直接叩くテーブル。**選択肢A（anon 全許可で
警告だけ消す）** を採用し、現状の挙動を変えずに RLS を有効化する。

| テーブル/ビュー | anon アクセスパターン | 採用ポリシー |
|---|---|---|
| `schedule` | schedule.html: SELECT/INSERT/UPDATE/DELETE。records.html: SELECT/UPDATE | `FOR ALL TO anon USING (true) WITH CHECK (true)` |
| `helper_master` | 直接アクセス無し。`schedule_web_v` JOIN 経由のみ | `FOR SELECT TO anon USING (true)` |
| `notifications` | schedule.html L281 で INSERT のみ | `FOR INSERT TO anon WITH CHECK (true)` |
| `client_users` | index.html L108（操作種別未確認） | 保守的に `FOR ALL TO anon` |

**ビュー `schedule_web_v` について**: PostgreSQL のビューは基底テーブルの
RLS を継承する（security_invoker の場合）。上記で `schedule` と
`helper_master` の SELECT を anon に許可するので、`schedule_web_v` の
SELECT も自動的に通る想定。

**実行 SQL**: `sql/enable_rls_schedule.sql`（2026-04-25 確定）

**選択肢B（厳密化）の見送り理由**:
- user-schedule-app は `schedule` を **WHERE 条件無しで全件取得**して
  クライアント側でフィルタしている（`.from('schedule_web_v').select('*')`）
- DB 側で利用者ごとに絞るには、user-schedule-app に request header 付与
  または認証導入が必要 → 116名へのデプロイを伴う大改修
- 即時の警告対応を優先し、厳密化は Phase 4 で別途検討

**ロールバック**: `DROP POLICY ...; ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`

---

### 🟣 グループC: 判断保留

現時点で残るアイテムなし。

- `helper_master` → グループB に編入（schedule_web_v JOIN 用に SELECT 許可）
- `client_users` → グループB に新規追加（index.html L108 で発見、SUPABASE_SCHEMA に未記載）
- `clients` テーブル → 存在確認は Phase 0 の診断 SQL で兼ねる

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

### Phase 2（**2026-04-25 完了**）: user-schedule-app 調査とポリシー設計

- ✅ user-schedule-app の `schedule.html` / `index.html` / `records.html` /
  `mypage.html` を `~/Desktop/user-schedule-app/` から取得して grep
- ✅ Supabase クライアント呼び出しを一覧化 → 本ドキュメント §5
- ✅ ポリシー SQL を `sql/enable_rls_schedule.sql` 確定版として整備
- ✅ 採用方針: **選択肢A（anon 全許可、現状維持）**

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

## 5. user-schedule-app 呼び出しパターン（2026-04-25 調査結果）

調査対象: `~/Desktop/user-schedule-app/` の `*.html` 4ファイル
（`schedule.html` / `index.html` / `records.html` / `mypage.html`）

### 5.1 schedule.html
- `from('schedule_web_v').select('*')` — L417, L901
- `from('schedule').select('*')` — L428, L824, L908（`*_web_v` 失敗時のフォールバック等）
- `from('schedule').insert(row).select('id').single()` — L623, L862
- `from('schedule').update({ start_time, end_time }).eq(...)` — L679
- `from('schedule').delete().eq(...)` — L735
- `from('notifications').insert({...})` — L281

### 5.2 index.html
- `from('client_users')` — L108（後続の操作未確認、保守的に FOR ALL）

### 5.3 records.html
- `from('schedule_web_v').select('*')` — L244
- `from('schedule').select('*')` — L249（フォールバック）
- `from('schedule').update({...})` — L363, L386

### 5.4 mypage.html
- DB アクセス無し（純粋な静的 HTML / グローバル UI）

### 5.5 共通の特徴

- **WHERE 条件無しで全件 SELECT** している（`select('*')` がそのまま流れる）。
  クライアント側でフィルタしているため、選択肢B（DB 側で利用者を絞る）には
  user-schedule-app の改修が必要
- **anon 直叩きテーブル**: `schedule`, `schedule_web_v`(view), `notifications`,
  `client_users` の4種のみ
- **`helper_master` は直接叩かない**（`schedule_web_v` の JOIN 経由のみ）

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
- **2026-04-25** Phase 2 完了。user-schedule-app の4 HTML ファイルを grep して
  anon アクセスパターンを確定（§5）。`notifications` を Group A → B に移動、
  `client_users` を Group B に新規追加（SUPABASE_SCHEMA 未記載）、`helper_master`
  を Group C → B に編入。`sql/enable_rls_schedule.sql` を選択肢A 確定版に更新。
  `sql/enable_rls_group_a.sql` から `notifications` を除外
