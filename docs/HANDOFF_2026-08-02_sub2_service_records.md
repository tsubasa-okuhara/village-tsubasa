# 引き継ぎ: サービス記録の sub2 移行（2026-08-02 時点）

このセッションで **読み取り専用の調査**により確定した事実と、そこから下した設計判断をまとめる。

---

## ⚠️ 更新（2026-08-02 夕方）: DDL 実行済み。以下の記述は一部が古い

**テーブルは作成済み。ただし §6 の設計判断のうち 6-4 / 6-6 は実装時に変更された。**
**§4 の「3アプリ」は誤認だった（§9-2 参照）。**

- 実際に作られたテーブル・変更された設計判断 → **§9**
- アプリ改修の影響範囲と方針 → **§10**
- `sql/2026-08-02_sub2_service_records.sql` は **実行されていない DDL 案**（`service_records` 1テーブル統合版）。
  実際に流した DDL とは別物なので、**このファイルをそのまま実行してはいけない**（§9-4）。

以下 §1〜§8 は DDL 実行前の調査記録として残す。

---

## 0. 全体像

2026-08 以降、**予定は sub2 に一本化済み**だが、**記録側は旧DBを向いたまま**。
この非対称を解消するため、sub2 に記録テーブルを新設する。

| | 旧DB `pbqqqwwgswniuomjlhsh` | sub2 `gmellfgcyypfrtjxblla` |
|---|---|---|
| 予定 | 2026-07 以前 | **2026-08 以降**（実装済み） |
| 記録 | **現在も全部こちら** | **未整備 ← 今回作る** |

データ境界の実装は `functions/src/lib/scheduleSource.ts:25-49`。
`CUTOVER_YEAR=2026` / `CUTOVER_MONTH=8`（環境変数で上書き可）。判定は必ず
`isSub2Date()` / `isSub2YearMonth()` / `getCutoverStartDate()` を通す。
**記録側も新しい定数を作らず、この関数群に相乗りする。**

---

## 1. sub2 `schedule_entries` の構造

**主キーは `bigint`。uuid 型の列も uuid らしき名前の列も1つも無い。**
旧DBのタスク／ノートが全部 `uuid` 主キーだったため、ここが最大の設計差分。

```
id                bigint [PK]     ← uuid ではない
sheet_name        text
week_label        text
date              date            ← 旧DBの service_date に相当（名前が違う）
start_time        time
end_time          time
recipient_number  text            ← 旧DBの beneficiary_number に相当
helper_name       text
user_name         text
transport         text            ← 旧DBの haisha に相当
support_flow      text            ← 旧DBの task に相当
helper_note       text            ← 旧DBの summary に相当
user_note         text
admin_note        text
source_row        integer
synced_at         timestamptz
created_at        timestamptz
updated_at        timestamptz
is_published      boolean
cancelled_at      timestamptz
```

**`helper_email` 列が無い。** ヘルパー特定は `helper` マスタ経由の2段引き:
`email → helper.helper_name → schedule_entries.helper_name`（**完全一致のみ**。
部分一致にすると「木野」が「木野(真)」「木野(遙)」を巻き込む）。

`helper` テーブル（5列）: `id uuid [PK]` / `helper_name` / `line_group_id` / `email` / `created_at`

### 件数（2026-08-02 実測）

```
全件                       4380 件
8月のみ                     4380 件   ← sub2 は8月分しか無い
8月より前 / 9月以降             0 件
is_published=true          4380 件   ← 全件 true
cancelled_at あり              0 件   ← キャンセル0件
helper_name が null        2951 件   ← 67%
recipient_number が null   2742 件
start_time が null         2775 件
user_name が null          2733 件
```

**実訪問行は 1429 件**（4380 − helper_name が null の 2951）。
残りは週シートの空きコマがそのまま行になっているもの。既存実装が
`.not("helper_name","is",null).neq("helper_name","")` で弾いているのはこのため。

### 実訪問行 1429 件の NULL 分布

```
user_name           0 / 1429   ← 完全に埋まっている
date                0 / 1429
start_time          5 / 1429
recipient_number    9 / 1429
```

### 行数が動く事実（重要）

前チャットの引き継ぎテキスト（2026-08-02付）では **8月分 4526 行**。
今回の実測は **4380 行**で、**146 件減っている**。
`schedule_entries.id` は週シート再同期のたびに振り直される
（`docs/CHANGELOG.md:22` に「同一予定で +6259 ずれた実測」）。
**行の全削除＋再投入が走っているため、`schedule_entries.id` は永続キーに使えない。**
記録側が `schedule_entry_id` を頼れないことの実証データ。

### 複合キーの重複チェック結果

実訪問行 1429 件に対し、下記3案すべて**ユニーク 1429・重複 0**（＝現時点ではどれでも衝突しない）:
- A: `(date, recipient_number, helper_name, start_time)` 生値
- B: visit_key 方式 `(date, HH:MM, 正規化user, 正規化helper)`
- C: A を正規化

※ 個人情報を出さないため sha256 ハッシュ化して件数のみ集計した。

---

## 2. sub2 に記録系テーブルは **1つも無い**

sub2 の全24テーブル:

```
analysis_snapshots / app_settings / client_ng_list / compatibility /
compatibility_snapshots / delay_notices / draft_requests / helper /
helper_assignment_state / helper_change_notices / helper_ng_list /
line_groups / location_suggestions / month_line_groups / monthly_confirmation /
patterns_202608 / patterns_all / schedule_entries / schedule_snapshot_202608 /
support_patterns / support_requests / sync_logs / user_default_patterns / users
```

`note` / `record` / `task` / `service` に該当するテーブルは無い。
**タスク側もノート側も、全部これから作る。**

なお **sub2 への書き込みは既に発生している**。`functions/src/delayNotify.ts` が
`getSupabaseSub2Client()` で `delay_notices` に INSERT/SELECT している
（`:176` `:248` `:850`）。「sub2 は読むだけ」ではない。

---

## 3. 旧DB の記録テーブルと、saveRecord が実際に書く列

### `service_notes_home`（21列）

```
id uuid [PK] / schedule_task_id uuid [FK→home_schedule_tasks.id] / service_date date /
helper_name / helper_email / user_name / task / memo / ai_summary / final_note /
created_at / updated_at / sent_at / beneficiary_number / schedule_id uuid /
deleted_at / deleted_by / deleted_reason / condition / special_notes_type / special_notes_detail
```

### `service_notes_move`（20列）

```
id uuid [PK] / schedule_task_id uuid（FK制約なし） / helper_email / helper_name /
user_name / service_date date / start_time / end_time / task / haisha / notes /
summary_text / created_at / sent_at / beneficiary_number / schedule_id uuid /
condition / special_notes_type / special_notes_detail / transport text[]
```

### `service_action_logs_home`（29列・任意の構造化ログ）

`id uuid [PK]` / `service_note_id uuid [FK→service_notes_home.id]` /
`schedule_task_id uuid [FK→home_schedule_tasks.id]` / `action_type` / `action_detail` /
`actor` / `target` / `assist_level` / `physical_state` / `mental_state` / `risk_flag text[]` /
`decision` / `decision_reason` / `event_type` / `before_state` / `after_action` /
`action_result` / `difficulty` / `location` / `time_of_day` / `temperature` /
`started_at` / `ended_at` / `duration_minutes` / `created_at` / `updated_at` /
`deleted_at` / `deleted_by` / `deleted_reason`

### saveRecord が **実際に INSERT している列だけ**

| | home（`saveRecord.ts:206-216`） | move（`saveRecord.ts:75-87`） |
|---|---|---|
| 共通 | `schedule_task_id` `service_date` `helper_name` `helper_email` `user_name` `task` | 同左 |
| 固有 | `memo` `ai_summary` `final_note` | `start_time` `end_time` `haisha` `notes` `summary_text` |

**`condition` / `special_notes_*` / `schedule_id` / `beneficiary_number` はどちらも書いていない。**

### タスク側テーブル（参考）

`home_schedule_tasks`（21列）と `schedule_tasks_move`（17列）。
どちらも `id uuid [PK]` / `schedule_id uuid [FK→schedule.id]` / `service_date date` /
`status`（`unwritten` → `written`）/ `source_key` を持つ。
GAS `gas/village-schedule-sync/★サービス記録内容転送.gs:112-154` が INSERT しているが、
**`source_key` も `schedule_id` も送っていない**。

---

## 4. 記録の入口は **3アプリ**（GAS転送の一本ではない）

`service_notes_*` に INSERT しているのは**すべてアプリ側の HTTP エンドポイント**。
GAS が入れているのは**予定/タスク側だけ**で、記録テーブルには一切書いていない。

| アプリ | ファイル:行 |
|---|---|
| village-tsubasa（本体） | `functions/src/service-records-home/saveRecord.ts:219`<br>`functions/src/service-records-move/saveRecord.ts:90` |
| village-tsubasa-home（別Firebaseプロジェクト） | `village-tsubasa-home/functions/src/service-records-home/saveRecord.ts:145-146` |
| village-tsubasa-move（別Firebaseプロジェクト） | `village-tsubasa-move/functions/src/service-records-move/saveRecord.ts:193-194` |

関連する読み取り側:
- `village-tsubasa-home/functions/src/service-records-home/listUnwritten.ts:60`（`home_schedule_tasks`）
- `village-tsubasa-move/functions/src/service-records-move/listUnwritten.ts:77`（`schedule_tasks_move`）
- `village-tsubasa-move/functions/src/service-records-move/listSheets.ts:86,103`
- `functions/src/service-records-structured/save.ts:335`（`service_notes_move` を SELECT）
- `functions/src/service-records-{home,move}/samples.ts`

**この3アプリすべてを改修しないと sub2 への切り替えは完了しない。**

---

## 5. 旧DB の 2026-08-01 以降は **全テーブル 0 件**

```
home_schedule_tasks    0 件（service_date 基準）
schedule_tasks_move    0 件（service_date 基準）
service_notes_home     0 件（service_date 基準）
service_notes_move     0 件（service_date 基準）
```

**8月のデータは旧DBに一切落ちていない。** 予定は sub2 に、記録はどこにも無い状態。
→ **データ移行は不要。境界（CUTOVER）を動かす必要も無い。**
（`service_action_logs_home` は日付列を持たず `service_note_id` 経由でしか日付が決まらないため未計測。
必要なら `created_at` 基準で数えられる。）

---

## 6. 設計判断

### 6-1. status を持たない

**記録行の存在＝記入済み**とする。`schedule_entries` に `status` 列は無く、
sub2 の既存テーブルへの `ALTER` は禁止のため足せない。

未記入一覧は「`schedule_entries` にあって記録テーブルに無い」で出す。
`schedule_entry_id` に FK を張らないので **PostgREST の埋め込み JOIN は使えない**。
「`schedule_entries` を GET → 記録テーブルを GET → アプリ側で突合」になる
（既存 `scheduleSource.ts` の helper 突合と同じ流儀）。

### 6-2. 二重保存防止は `record_uuid` の UNIQUE

`record_uuid uuid NOT NULL UNIQUE` を軸にする。同じ UUID で2回 INSERT すれば DB が弾く。

**前提2つ（GAS 側の設計として奥原が確定・保証）:**
1. 転送シート J 列の UUID は**行ごとに1回だけ発行**し、**再同期でも振り直さない**
2. アプリは **J 列由来の UUID をそのまま送る**（アプリ側で発行しない）

**この前提が崩れると UNIQUE は機能しなくなる。GAS を変更する際は必ずこのメモを読み直すこと。**

### 6-3. `visit_key` は採用しない

`delay_notices.visit_key`（`delayNotify.ts:15-23, 221-233`）と同じ
`"YYYY-MM-DD|HH:MM|正規化利用者名|正規化ヘルパー名"` 方式を一度検討したが、**不採用**。

**理由（奥原判断）:** 記録の入口が3アプリある以上、`visit_key` を正しく組み立てる責任も
3か所に散る。UNIQUE を張らない列は、埋まったり埋まらなかったりする信用できない列になり、
「後付け UNIQUE の保険」としても機能しない（保険が効くのは全行に正しく入っている場合だけ）。
必要になったら、その時のデータを見て設計し直す。

参考: 正規化関数は `delayNotify.ts:577-580` の `normalizeName()`
（空白除去 + 末尾「様」除去）。将来使うならこれを共有する。

### 6-4. 居宅/移動は `service_type` で1テーブル統合

2テーブル維持と比較した結果、統合を採用。決め手は
**「同じ訪問に記録が2件入りうる構造は、記録行の存在で状態を持たせる設計と矛盾する」**点。
2テーブルだと home と move の両方に同じ訪問の記録を入れられてしまい、
その防止をアプリ側の約束事に頼ることになる（旧DBで `status` 列に頼っていたのと同じ問題）。

種別固有列に `NOT NULL` が書けなくなるが、`CHECK (service_type <> 'home' OR final_note IS NOT NULL)`
で同等に担保できる。

### 6-5. `destination`（移動支援の目的地）

sub2 の `schedule_entries` に目的地の専用列は無い（近いのは `transport` / `support_flow` だが
いずれも目的地そのものではない）。
**目的地は転送シート H列「支援の流れ」に含まれるため、GAS 側で切り出して
`destination text` に入れる。** 列はそのまま残す。

### 6-6. 持ち込まない列と理由

| 列 | 理由 |
|---|---|
| `source_key` | 生成元がリポジトリ内に無い。`gas/` `functions/src/` を全文検索しても生成コード0件。伊藤さん管理の「無題のプロジェクト」（git 未取り込み・RULES.md ルール4で触らない対象）にあると推定。仕様不明のまま持ち込めない |
| `schedule_id` | 旧DBの `service_notes_*` にあるが FK 制約が無く用途不明 |
| `condition` / `special_notes_type` / `special_notes_detail` | 現行の `saveRecord` がどちらも書いていない未使用列。直近コミット `90926e4`（構造化入力3セクション削除）とも整合 |
| `status` | 記録行の存在そのもので代替する（6-1） |
| `beneficiary_number` | sub2 では `recipient_number` という名前で持つ |

### 6-7. 構造化ログは後回し

旧 `service_action_logs_home` 相当。home の任意入力機能で、8月開始に必須ではない。
sub2 への DDL は少ないほど安全なので、必要になった時点で
`service_records.id` を参照する FK 付きで `CREATE TABLE` する。

---

## 7. sub2 への DDL 制約（厳守）

sub2 は**他者が構築した本番環境**。既存テーブルには他者のデータと運用が乗っている。

**許可されるのは新テーブルの `CREATE TABLE` と、その新テーブルへの `CREATE INDEX` のみ。**

禁止:
- `ALTER` / `DROP` / `TRUNCATE` / `DELETE`
- `IF NOT EXISTS` / `OR REPLACE`（既存物との衝突をエラーとして検知するため）

既存テーブルへの変更が必要だと判断した場合は、**実行せず必ず奥原に相談する**。

調査は GET のみで行うこと。列一覧は OpenAPI スキーマ（`GET /rest/v1/`）から取れば
行データを1件も取得せずに済む。件数は `Prefer: count=exact` の `Content-Range` ヘッダで取る。

sub2 の接続情報:
- URL は `functions/src/lib/supabase.ts:8` にハードコード
- キーは Firebase Secret `SUPABASE_SUB2_SERVICE_ROLE_KEY`（**`.env` には無い**）
- 取得: `firebase functions:secrets:access SUPABASE_SUB2_SERVICE_ROLE_KEY --project village-tsubasa`
  （**exit code で成否を判定すること**。firebase CLI は認証エラーを stdout に出すため、
  出力をそのまま鍵として使うと認証エラー文が鍵として渡る）

旧DB の URL / キーは `.env` の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`。

---

## 8. 次回やること

### 8-1. SQL ファイルの未適用の修正（最優先）

`sql/2026-08-02_sub2_service_records.sql` に **`visit_key` を落とす修正が未適用のまま残っている**。
そのまま実行すると意図しない列が作られる。

1. **45-52行目の `visit_key` 列の宣言ブロックを削除**（コメント含む）
2. **102-104行目の `CREATE INDEX idx_service_records_visit_key` を削除**
3. 41-42行目の `destination` のコメントを 6-5 の内容（転送シート H列から GAS が切り出す）に更新
4. 110-114行目の積み残しメモ「1. destination に何を入れるか」を解決済みとして更新

### 8-2. 3アプリの `saveRecord` 改修の影響範囲を洗い出す

`record_uuid` を受け取って送る改修。対象は 4.節のファイル一覧。
フロントエンド（`public/` 配下）が `record_uuid` を予定側から受け取って
POST に載せる経路も要調査。**未着手。**

### 8-3. DDL 実行

8-1 の修正後に sub2 へ流す。実行したら `docs/CHANGELOG.md` と
`docs/SUPABASE_SCHEMA.md` に追記する（RULES.md ルール5）。
**現時点ではスキーマ未変更のため CHANGELOG は未記入。**

---

## 9. 実施済み（2026-08-02 夕方）

### 9-1. sub2 に作成した2テーブル（RLS 有効）

**§6-4 の「1テーブル統合」は不採用。旧DB と同じく居宅／移動の2テーブルに戻した。**

`service_records_home`（16列）
```
id / record_uuid (NOT NULL UNIQUE) / service_date / start_time / end_time /
helper_name / user_name / helper_email / recipient_number / task /
condition / special_notes_type / special_notes_detail /
final_note / created_at / updated_at
```

`service_records_move`（18列）
```
上記の final_note を summary_text に置き換え、haisha / transport (text[]) を追加
```

INDEX: 各テーブルに `service_date` と `helper_email`。

**§6-6 からの変更点:**
- `condition` / `special_notes_type` / `special_notes_detail` は **持ち込んだ**
  （記載基準3項目の書き込み先。§6-6 で「未使用列」として落とす判断をしていたが逆転）
- 列名は `visit_*` ではなく旧DB と同じ `service_date` / `start_time` / `helper_name` を採用
- `visit_key` / `schedule_entry_id` / `destination` / `sent_at` / `status` /
  `schedule_task_id` / `schedule_id` / `source_key` / `ai_summary` / `memo` / `notes` /
  `deleted_*` は **持たない**

### 9-2. 訂正: 「3アプリ」は誤認だった

§4 で「記録の入口は3アプリ」としたが、実際は **1アプリ + 古い git worktree 2つ**。

```
$ git worktree list
/Users/mewself/village-tsubasa                    90926e4 [feat/service-records-criteria-3items]
/Users/mewself/village-tsubasa/village-tsubasa-home  2af7bcf [feat/service-records-home]   ← 2026-03-18
/Users/mewself/village-tsubasa/village-tsubasa-move  9c6d15f [feat/service-records-move]   ← 2026-03-26
```

- `village-tsubasa-home/.git` `village-tsubasa-move/.git` は **gitdir ポインタ**。
  本リポの `.git/worktrees/` 配下を指す（＝別リポではない）
- 両方とも `.firebaserc` の default は **`village-tsubasa`**（同じ Firebase プロジェクト）。
  「別 Firebase プロジェクト」ではない
- ルートの `.gitignore:9-10` で無視されており、git 管理外
- `2af7bcf` は main の祖先。`9c6d15f` は main に未マージだが3月時点のコード

→ **これらは3月の作業用 worktree の残骸。改修対象から外す。**
→ **`SUPABASE_SUB2_SERVICE_ROLE_KEY` を他プロジェクトに設定する作業は不要**（同一プロジェクトのため既に設定済み）。
→ ここから `firebase deploy` すると3月のコードで本番 hosting/functions を上書きする。
   **整理（`git worktree remove`）を検討すること。**

### 9-3. GAS 転送

独立プロジェクト「サービス記録転送 sub2」で 8/1 分 30件（居宅6・移動24）を INSERT 済み。
GAS が `record_uuid` を発行して**行を先に作る**。本文（`final_note` / `summary_text`）は空。

リポジトリ内の `gas/village-schedule-sync/★サービス記録内容転送.gs` は
**旧DB の `home_schedule_tasks` / `schedule_tasks_move` に INSERT する別物**。
sub2 転送用 GAS はリポジトリに未取り込み。

### 9-4. `sql/2026-08-02_sub2_service_records.sql` の扱い

実際に流した DDL と一致しない（`service_records` 1テーブル統合版・`visit_*` 列名・`visit_key` あり）。
**このまま実行すると意図しないテーブルができる。** 実行した DDL に差し替えるか、
「未採用案」と明記して退避すること。**未対応。**

---

## 10. アプリ改修の影響範囲と方針

### 進捗サマリ（2026-08-02 時点）

**✅ 実装済み — これでヘルパーは8月の記録を書ける**

- 未記入一覧の取得元を sub2 に切り替え（居宅・移動）
- 保存を旧DB INSERT から sub2 の `record_uuid` UPDATE に切り替え（居宅・移動）
- 旧DB への書き込み経路を全削除（INSERT / status 更新 / ロールバック / 構造化ログ INSERT）
- `lib/serviceRecordsSub2.ts` を新設して sub2 記録テーブルへのアクセスを集約
- 保存判定のテスト5件（`functions/` で `npm test`）

**❌ 未実装 — 明日ここから再開**

1. `service-records-{home,move}/previous.ts` … 旧DB のタスク表を見たまま。8月の「前回の記録」が出ない
2. `service-records-{home,move}/samples.ts` … 旧DB のみ。8月分が AI 下書きの参考例に入らない
3. `service-records-structured/save.ts` … sub2 の記録に対して 404 を返す。
   **移動の画面で構造化欄を埋めると「構造化ログの保存に失敗しました」が出る**（優先度高）
4. `lib/recordCutoff.ts` … コメントが旧テーブル名のまま（動作影響なし）
5. 記載基準3項目（`condition` / `special_notes_*` / `transport`）の UI と保存（§10-2）
6. village-admin が旧DB を読んでいる件（§10-3 の4）

**デプロイはまだ。** 未デプロイなので本番のヘルパー画面は旧DB のままで、
一覧が空になる等の実害は出ていない。

### 10-0. 最大の設計変更: INSERT → UPDATE

| | 旧 | 新（sub2） |
|---|---|---|
| 保存 | アプリが `service_notes_*` に INSERT + タスクの `status` を `written` に UPDATE | GAS が作った行を `record_uuid` で **UPDATE** |
| 未記入判定 | `home_schedule_tasks.status = 'unwritten'` | `final_note`（move は `summary_text`）が NULL または空 |
| 一覧の絞り込み | `helper_email` | `helper_email`（`schedule_entries` 経由の氏名突合は不要） |

`service_records_*` は GAS が予定の属性（日付・時刻・氏名・メール・受給者番号・task）を
全部埋めた状態で作るため、**未記入一覧は `schedule_entries` を見なくてよい**。
`scheduleSource.ts` の helper マスタ2段引きも記録側では不要。

境界判定は既存の `isSub2Date()`（`functions/src/lib/scheduleSource.ts:39`）に相乗りする。新定数は作らない。

### 10-1. 改修対象（すべて本リポの `functions/src/` と `public/`）

| 状態 | ファイル | 内容 |
|---|---|---|
| ✅ | `lib/serviceRecordsSub2.ts` | **新設**。sub2 記録テーブルへのアクセスを集約（一覧・保存・過去記録・レスポンス変換） |
| ✅ | `lib/serviceRecordsSub2.test.ts` | **新設**。保存の3分岐（updated / already_written / not_found）と `isBlankBody()` を固定 |
| ✅ | `service-records-home/saveRecord.ts` | 旧DB INSERT + status 更新 + ロールバック + 構造化ログ INSERT を全削除。`record_uuid` で UPDATE |
| ✅ | `service-records-move/saveRecord.ts` | 同上。`helper_email` 必須チェックも撤去（`record_uuid` 単独で行を特定できるため） |
| ✅ | `service-records-home/listUnwritten.ts` | `service_records_home` の `final_note` 空を抽出。`id` に `record_uuid` を載せフロントの契約を維持 |
| ✅ | `service-records-move/listUnwritten.ts` | 同上（`summary_text` 空）。項目に `haisha` を追加（後述の欠落バグ） |
| ✅ | `public/service-records-move/main.js` | save の catch が固定文言に潰していたのを、サーバの日本語 message を出すよう修正 |
| ❌ | `service-records-home/samples.ts:55` | 旧DB `service_notes_home` のみ。8月分が参考例に入らない。**旧DB と sub2 の両取り**が要検討 |
| ❌ | `service-records-move/samples.ts:54` | 同上 |
| ❌ | `service-records-home/previous.ts:38` | `home_schedule_tasks` status=written のまま。sub2 の記録済み行を引く必要あり |
| ❌ | `service-records-move/previous.ts:35` | 同上 |
| ❌ | `service-records-structured/save.ts:335` | 旧DB `service_notes_move.id` の存在確認。sub2 の record_uuid は見つからず **404**。`isSub2Date()` なら保存せず ok を返す形にする |
| ❌ | `lib/recordCutoff.ts` | コメントが旧テーブル名のまま。定数値 `2026-08-01` は据え置きでよい |
| 対象外 | `services/moveCheckService.ts:48` | 旧DB を読むが **`moveCheckRouter` が index.ts にマウントされておらず、`public/` にも呼び出し元が無い**（到達不能なコード）。動かないものを移植しても検証できないため据え置き。使うときに sub2 へ向けること。`.order("date")` の既知バグ（RULES.md ルール7）もその時に直す |
| 変更不要 | `public/service-records-home/main.js:1464` | `scheduleTaskId: task.id` を POST。`id` に `record_uuid` が載るので改修不要 |
| 変更不要 | `public/service-records-move/main.js:487` | `taskId: task.taskId` を POST。同上 |
| 変更不要 | `public/qrec-okuhara-9k2b/main.js:720,746` | 居宅=`task.id` / 移動=`task.taskId`。同上 |

### 実装中に判明したこと

- **移動の `haisha` が保存時に常に欠落していた。** フロントは
  `state.selectedTask.haisha` を送るが、旧DB 版の未記入一覧の項目に `haisha` キーが
  無かったため常に `undefined` だった。sub2 では GAS が `haisha` を埋めるので実害は消える。
- **移動の save の catch がサーバの message を捨てていた。** 固定文言
  「保存に失敗しました。時間をおいて再試行してください。」に潰していたため、
  「すでに保存済み（409）」でも再試行を促す表示になっていた。居宅は素通しで問題なし。
- **7月以前の保存経路は落とした。** 未記入一覧が 8/1 以降しか出さず、
  7/31 以前は事業所側で精査する運用のため。古いタブから飛んできた場合は
  黙って旧DB に書かず 400 で断る（`isSub2Date()` チェック1箇所で復活可能）。

### 10-2. 記載基準3項目（ブランチ名 `feat/service-records-criteria-3items` の本題）

`condition` / `special_notes_type` / `special_notes_detail` / `transport(text[])` は
**sub2 に列を作っただけで、入力 UI も保存経路も無い**。
コミット `90926e4` は「3項目を足す前に画面を削って余白を作る」引き算フェーズ。足し算はこれから。

データソース切替（10-1）と3項目追加（10-2）は**別コミットに分ける**。

### 10-3. 未決の判断（実装前に決める必要あり）

1. **`memo` の行き先が無い**
   `service_records_home` に `memo` 列が無い。しかしフロントは `buildMemoText()` で
   `区分: / 主チェック: / 子チェック: / 補足:` 形式の `composedMemo` を組み立てて送っており
   （`public/service-records-home/main.js:1013,1470`）、
   **village-admin の `parseMemo` がこの形式に依存している**（RULES.md ルール7）。
   → 捨てる / `final_note` に畳む / sub2 に列を足す（他者DB への ALTER は禁止 → 新テーブル）のいずれか。

2. **`notes`（移動のメモ）の行き先が無い**
   `service_records_move` に `notes` 列が無い。移動のフロントは `notes` を**必須**として送る
   （`public/service-records-move/main.js:389,496`）。

3. **`structuredLog` / `ai_summary` の行き先が無い**
   `saveRecord.ts` が `service_action_logs_home` に INSERT しているが sub2 に相当テーブル無し（§6-7 で後回し判断）。
   `ai_summary` 列も無い（現状 `aiSummary: null` 固定なので実害は小さい）。

4. **village-admin が旧DB の `service_notes_*` を読んでいる**
   記録が sub2 に移ると **8月以降が village-admin から見えなくなる**。
   RULES.md ルール4 の「他アプリに触れる変更は事前共有」に該当。**別リポの改修が必要。**

5. **`final_note` 冒頭の時刻プレフィックス**
   village-admin の `parseTimeFromFinalNote` が `YYYY-MM-DD HH:MM:SS〜HH:MM:SS` を抽出する（RULES.md ルール7）。
   sub2 でも同じ形式で書き続けるか、`start_time` / `end_time` 列があるので廃止するか。

6. **旧DB 経路をいつ落とすか**
   `RECORD_LIST_CUTOFF_DATE` により未記入一覧は 8/1 以降のみ＝全部 sub2。
   ただし `samples` / `previous` は過去データ（旧DB）に価値があるので残す想定。
   保存は `isSub2Date(serviceDate)` で分岐させ、旧DB 経路も当面残すのが安全。

---

## 11. 書き込み責任の分界点（2026-08-02 決定）

**旧DB とここが一番違う。** 旧DB ではアプリの `saveRecord` が INSERT で
日付も氏名もメールも全部書いていた。sub2 では書き手を分ける。

> **予定由来の値は GAS が転送時に確定させる。**
> **アプリは本文と、ヘルパーが画面で入力した列だけを UPDATE する。**

理由: アプリが予定由来の列を上書きできると、**古いタブを開きっぱなしのヘルパーが
保存した瞬間に、転送済みの正しい値が古い値で潰れる**経路ができる。
書き手を1つに絞れば、その事故が構造的に起きない。

### 列ごとの書き手

| 列 | 書き手 | 備考 |
|---|---|---|
| `id` | DB | `DEFAULT gen_random_uuid()` |
| `record_uuid` | **GAS** | 転送シート J 列。行ごとに1回だけ発行、再同期でも振り直さない（§6-2） |
| `service_date` / `start_time` / `end_time` | **GAS** | |
| `helper_name` / `user_name` / `helper_email` | **GAS** | |
| `recipient_number` | **GAS** | 旧DB の `beneficiary_number` 相当 |
| `haisha`（move） | **GAS** | 予定側の値。画面で編集できない |
| `task` | 居宅=**アプリ** / 移動=**GAS** | 居宅は「身体介護 / 家事援助 / 通院等介助」をヘルパーが選ぶ入力。移動は目的地で編集不可 |
| `final_note`（home） / `summary_text`（move） | **アプリ** | 記録本文。空＝未記入 |
| `memo`（home） / `notes`（move） | **アプリ** | |
| `condition` / `special_notes_type` / `special_notes_detail` | **アプリ**（未実装） | 記載基準3項目。§10-2 の後日対応 |
| `transport`（move, text[]） | **アプリ**（未実装） | 同上（移動手段） |
| `created_at` | DB | |
| `updated_at` | **アプリ** | UPDATE のたびに必ず更新する |

### コード上の担保

`functions/src/lib/serviceRecordsSub2.ts` の `Sub2HomeSavePayload` /
`Sub2MoveSavePayload` に **アプリが書いてよい列しか定義しない**。
型に無い列は渡せないので、分業がコンパイル時に効く。

- `Sub2HomeSavePayload` = `final_note` / `memo` / `task`
- `Sub2MoveSavePayload` = `summary_text` / `notes`

記載基準3項目を実装するときは、この2つの型に列を足すのが入口になる。
**GAS 側の列（日付・時刻・氏名・メール・受給者番号・haisha）を足してはいけない。**

---

## 付録: このセッションで実行した調査（すべて読み取り専用・GET のみ）

スクリプトはスクラッチパッドに置いた（セッション限り）。再実行が必要なら書き直す。

- sub2 / 旧DB の OpenAPI スキーマ取得 → テーブル一覧・列定義・FK 参照先
- `Prefer: count=exact` の `Content-Range` による件数取得（行データ非取得）
- 複合キーの重複チェック（4列を sha256 ハッシュ化してから集計。生値・ハッシュとも非出力）

`POST` / `PATCH` / `PUT` / `DELETE` / RPC / SQL は一度も実行していない。
