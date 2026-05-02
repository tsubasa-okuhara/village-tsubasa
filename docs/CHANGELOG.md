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

最終更新: 2026-05-02（今日の予定に合同ヘルパー表示を追加、本番デプロイ済み）

---

## 2026-05-02 [village-tsubasa] 「今日の予定」に合同ヘルパー表示を追加

### 背景
個人別の「今日の予定」画面（`/today-schedule/?helper_email=...`）では、`helper_email` で絞り込んだ自分のシフトしか表示されず、**同じ利用者・同じ開始時刻に他のヘルパーが入っている合同シフト**だと相方が見えなかった。

全体スケジュールでは「金城・塚田・三枝」のように合同表記されているため、個人画面でも同じ情報が欲しいという要望に対応。

### 変更内容
- `functions/src/todaySchedule.ts`: API レスポンスの `TodayScheduleItem` に `coHelpers: string[]` を追加。当日の全レコードを取得した後、本人の各シフトについて `(client, start_time)` が一致する他ヘルパー名を集約して返す
- `public/today-schedule/main.js`: カード内に `🤝 合同 塚田・三枝` 行を追加表示。合同ヘルパー無しの場合は表示しない
- 全体スケジュール（`todayScheduleAll.ts`）は **無変更** — 元から合同表記されていたため

### 影響範囲
- village-tsubasa: 個人画面のみ機能追加。既存の全体スケジュールに影響なし
- village-admin / user-schedule-app: 影響なし
- Supabase: スキーマ変更なし

### 関連コミット
- `2c121eb` feat: today-schedule に合同ヘルパー表示を追加

---

## 2026-04-30 [village-tsubasa] スケジュール画面: 同一利用者×開始時刻の複数ヘルパーを個別ブロック表示に変更

### 背景

これまで「利用者名 + 開始時刻」が同じレコードが複数ある場合、ヘルパー名のみ
「担当：A・B・C」と集約され、各人の終了時刻 / 配車 / 内容（task）は **最初に出現した
ヘルパーのものだけ** が表示されていた。

実運用では同じ利用者・同じ開始時刻でも以下のように **役割が異なる** ケースがある:

| パターン | 例（5/2 のスプレッドシート） |
|---|---|
| 送迎のみで離脱 | 若林慶様 9:30 — 伊藤（自宅お迎え／ピックアップで終了）+ 久保田（同乗で 9:30〜14:30 同行） |
| 完全 2 人体制 | 久保田英仁様 10:00〜17:00 — 伊藤・久保田 両方とも GH→外出→上池台 |
| 顔合わせ 3 人 | 根岸誠一郎様 13:00〜14:00 — 塚田・三枝・金城（プリウスで顔合わせ） |

旧表示では「伊藤・久保田」とだけ出るので、伊藤がピックアップだけで離脱することが
読み取れず、現場の混乱要因になっていた。

### 変更内容

利用者名 × 開始時刻が同じレコードが **2 件以上** ある場合、利用者ヘッダーの下に
ヘルパーごとのサブブロックを並べて表示する方式に変更。

- 1 人だけ → 従来表示のまま
- 2 人以上 → 利用者名（👤）の下に、ヘルパーごとに 担当 / 🕒 / 🚗 / 📝 をブロック表示
- 並び順はスプレッドシート登場順を保持

### 対応画面

| 画面 | パス |
|---|---|
| 月間カレンダー（日タップポップアップ） | `public/schedule-sync/` |
| 今日の全員予定 | `public/today-schedule-all/` |
| 明日の全員予定 | `public/tomorrow-schedule-all/` |

個人の `today-schedule/` / `tomorrow-schedule/` は API が自分の行のみ返すため
複数ヘルパーグルーピングは発生しない想定 → 触らず。
将来「2 人体制で組まれているとき他のヘルパーも見たい」需要が出たら
API 側の改修が必要。

### 影響範囲

- `village-tsubasa` リポ内のみ（フロントエンドの表示ロジックのみ変更）
- バックエンド API・スプレッドシート・Supabase スキーマには無影響
- 既存データはそのままで効く（過去の予定にも遡及して新表示になる）

### 関連コミット

- `360b662` feat(schedule): 同行など同一利用者×開始時刻の複数ヘルパーを個別ブロックで表示

### デプロイ

- preview channel: `preview-multi-helper`（5/2 の若林慶様・久保田英仁様・柳詰直人様で確認済み）
- 本番: `village-tsubasa.web.app` に 2026-04-30 デプロイ済み

---

## 2026-04-30 [village-tsubasa] ヘルパーセルフマッチング Phase 1A: dry-run 完了、apply 前の整備フェーズで一時停止

### 進捗

1. ✅ DDL 実行済み（commit `f4a14e9`、実行確認済み）
   - `user_helper_compatibility` テーブル作成
   - `helper_master` に `can_drive` / `license_juuhou` / `license_koudou` / `license_kyotaku` / `license_idou` / `capabilities_updated_at` 列追加
2. ✅ GAS スクリプト書き込み（commit `b38eddc` まで）
   - `gas/village-schedule-sync/対応可否シート移行.gs` 作成
   - 関数名規約整理（`_` suffix で内部関数を非公開化、commit `dee956a`）
   - 対応可否シート ID のタイポ修正（`Df` → `dGf`、commit `b38eddc`）
3. ✅ Apps Script Editor に貼り付け済み
4. ✅ Project 名を「【ビレッジつばさ】全体スケジュールバックグランド」に rename（または rename 中）
5. ✅ **dry-run 実行完了**（2026-04-30 10:03 JST）

### dry-run 結果

```
シート上のヘルパー列: 61 名
  helper_master と一致: 28 名
  ⚠️ 未マッチ: 33 名
  → 未マッチ一覧: 木野遙仁, 岩瀬, 足立, 岩﨑, 岩﨑祐, 鈴木, 稔, 河野, 久保,
    赤代, 永島, 大堀, 品川, 田中, 真奈美, 城所, 矢部, 天原, 松本, 伊藤沙織,
    永島, 笹川友理, 立花, 石川, ふきの, 馬場, 榎, 菅原, 井原, 坂口, 新規,
    新規, 井上
シート上の利用者: 168 名
UPSERT 予定セル数: 4704
ステータス分布: {1: 188, 2: 141, ⚪︎: 1378, ×: 2916, △: 81}
⚠️ 不明な値のセル: 1910 個
  → 先頭サンプル: ＮＧ (全角 NG), ✖ (全角 X) などの変種
```

### 残タスク（次回チャットで続き）

#### A. 不明な値 1910 件のうち、明らかに既知の変種を normalizer に追加
- `ＮＧ` (全角 NG, U+FF2E + U+FF27) → `N`
- `✖` (全角 X, U+2716) → `×`
- 上記は実態として存在する記法。`gas/village-schedule-sync/対応可否シート移行.gs:284` 付近の `normalizeStatus_()` に追加する

#### B. 未マッチ 33 ヘルパーの整備（奥原さん作業）
- helper_master に登録不足のヘルパーを追加 or
- 既存 helper_master の `helper_name` を ⚪︎×シートの列見出しに合わせて改名（姓のみ統一）
- 注意: 「新規」が 2 件あるのは、シート上のプレースホルダ列（実在しないヘルパー）の可能性大 → 削除 or rename

#### C. apply 実行
- A, B が完了したら `migrateCompatibilityApply()` を実行
- 4704 件 UPSERT（known ヘルパー 28 名 × 利用者 168 名）

#### D. 週次トリガー設定
- `installWeeklyCompatibilityTrigger()` を 1 回実行
- 毎週月曜 03:00 JST に lenient モードで自動同期

### 影響範囲

- **本日時点で本番アプリに影響なし**（dry-run のみ、書き込みなし）
- DDL は実行済みだが、テーブルが空なので既存運用への影響なし
- Supabase の helper_master 列追加も既存クエリに無影響

## 2026-04-29 [village-tsubasa] ヘルパーセルフマッチング・プロジェクト 設計検討開始（実装は次回以降）

### 構想

ヘルパー名未割当の支援を、ヘルパー側から自分で「入れます」と手を挙げる仕組みを作る。

- **第1段階（今回着手予定）**: 管理者経由型
  - ヘルパー: village-tsubasa で未割当支援を一覧 → チェックを入れる
  - 管理者: village-admin に通知が届く（画面バッジ + 1日1回サマリメール）
  - 管理者: 利用者に電話 / LINE で確認 → OK ならヘルパーに連絡 → schedule.helper_email を確定
- **第2段階（将来 / 自立型）**: ヘルパー → 利用者の直接マッチング、管理者は介在せず最終確定だけ承認
- **優先順位**: 管理者の評価で決める（admin_users の評価値 or 別テーブル）

### 設計の決定事項

| 項目 | 決定 |
|---|---|
| データモデル | 新テーブル `schedule_claims`（schedule_id + helper_email + status + 優先順位スコア + 時刻）を追加。`schedule` 本体は不変 |
| 管理者通知 | 画面バッジ（即時）+ 1日1回サマリメール |
| ヘルパー候補定義 | パターン A のみ：`helper_email IS NULL AND name 空 AND client あり AND start_time あり` |

### 実データ検証で判明した重要な事実

#### GAS の Supabase 転送フィルタ — 確定情報

`gas/village-schedule-sync/★supabase転送本体.gs:35-40` の `SKIP_BG_COLORS` は **グレー 4 色のみ**:

```js
const SKIP_BG_COLORS = {
  '#434343': true,
  '#666666': true,
  '#999999': true,
  '#b7b7b7': true
};
```

| 色 | 意味 | Supabase 転送 |
|---|---|---|
| `#00ffff`（水色） | ヘルパー割当済 | ✅ 送る |
| `#ffff00`（黄色） | **ヘルパー未割当（未定）** | ✅ **送る** ← 当初仮説に反する |
| `#434343` `#666666` `#999999` `#b7b7b7`（グレー） | 「車対応のみ」など特殊行 | ❌ 送らない |

→ **黄色（未定）行は Supabase に流れている**。ヘルパーアプリで `helper_email IS NULL` を SQL で取れば候補が拾える。当初の仮説（GAS が黄色を弾いている可能性）は誤りだった。

#### `schedule` テーブルの helper_email IS NULL データ — 3 パターン

実データのサンプリング結果、以下 3 パターンに分類できる:

- **A. 純粋な未割当**: `client` あり / `name` 空 / `helper_email` null / 時刻あり
  - 例: 稲葉晃作様 8:40-9:45（5/1）/ 石井翔真様 16:20-17:20（5/1）
  - → **ヘルパーが手を挙げる候補に出す**
- **B. 名前だけある（メール未登録ヘルパー）**: `client` あり / `name = "真望"` 等 / `helper_email` null / 時刻あり
  - 例: 真望 / 稲山蓮九様 7:35-7:50
  - → **候補に出さない**（既に決まっているが、当該ヘルパーのメールが Supabase に未登録なだけ）
  - → 別途、奥原さんに「真望さんは何者か？メール登録すべきか？」要確認
- **C. 特殊メモ・不完全行**: `client` 空 or 時刻 null
  - 例: 「大田生活実習所　休み」（client に休みメモ）/ 若林慶様（時刻 null）
  - → **候補に出さない**（運用上のメモ用途）

#### 候補リスト用 SQL フィルタ（次回そのまま使う）

```sql
SELECT id, date, start_time, end_time, client, ...
FROM schedule
WHERE
  helper_email IS NULL
  AND deleted_at IS NULL
  AND date >= CURRENT_DATE
  AND (name IS NULL OR TRIM(name) = '')   -- パターン B 除外
  AND client IS NOT NULL                  -- パターン C 除外
  AND TRIM(client) <> ''
  AND start_time IS NOT NULL              -- パターン C 除外
ORDER BY date, start_time;
```

#### `schedule` テーブルの列名 — 注意

`schedule` の列名は **`date` / `name` / `client`**（`service_date` ではない）。
`service_date` は `schedule_tasks_move` テーブル側の列名。混同しやすいので
`functions/src/scheduleEditor/create.ts:180-191` のカラムリストを参照。

### 次回のステップ

1. SQL #1 で `helper_email IS NULL AND date >= CURRENT_DATE` の規模感を確認
2. パターン B の「真望」さんの正体を奥原さんに確認
3. パターン C の運用見直しを奥原さんに確認
4. `schedule_claims` テーブル DDL を SQL ファイルで提案 → 奥原さんレビュー → Supabase で実行
5. ヘルパー側 API + UI を村つばさリポで実装
6. 管理者側のバッジ + メール通知は **village-admin リポ** で別途実装

### 影響範囲

- **本日時点ではコード変更ゼロ、検証と設計検討のみ**
- 本リポ / village-admin / user-schedule-app / GAS / Supabase / Firebase Functions、いずれにも変更なし
- ヘルパーさん含む利用者・運営者影響ゼロ

---

## 2026-04-28 [village-tsubasa] schedule-editor に「🛟 強制リセット」ボタンを追加

### 背景

- スマホで schedule-editor を使用中にページが固まることがある
- 通常の「🔄 再読み込み」は API 再取得のみで、ブラウザのキャッシュ／Service Worker が原因の場合は救済できない
- 詰まった時の最後の手段として、PC で言う「キャッシュ削除とハード読み込み」相当の操作を 1 ボタンで実行できるようにする

### 変更内容

- `public/schedule-editor/index.html`: ツールバーに `#hard-reset-button` を追加（既存 `🔄 再読み込み` の右隣）
- `public/schedule-editor/style.css`: `.hard-reset-btn`（薄オレンジ、警告色寄り）スタイルを追加
- `public/schedule-editor/main.js`: `hardReset()` 関数を新設

### `hardReset()` の動作

1. 確認ダイアログ表示（誤クリック防止）
2. `caches.keys()` で取得したすべての Cache Storage を `caches.delete()`
3. `navigator.serviceWorker.getRegistrations()` で取得した SW を `unregister()`
4. `sessionStorage.clear()`
5. URL クエリに `_t=<timestamp>` を付けて `location.replace()` し、ブラウザキャッシュをバスト
6. localStorage は触らない（メールアドレスを保持して再ログインの手間を省く）

### 影響範囲

- village-tsubasa の `/schedule-editor/` 画面のみ
- バックエンド（Functions / Supabase）への変更なし
- 他のヘルパー画面（`/`）には影響なし

### deploy 不要

- 静的ファイルのみの変更だが、Firebase Hosting への deploy が必要
  - `firebase deploy --only hosting`
- Functions の deploy は **不要**（API 変更なし）

## 🔔 次回チャットで Claude が奥原さんに確認すべきこと（2026-04-29 朝 更新）

> **新チャットの Claude へ**: 以下を作業冒頭で必ず聞いてください。
> 奥原さんが「やる」と答えたら実施、「やらない」と答えたら該当項目を削除してください。

### ✅ 4/28 の作業で完了したもの（参考・対応不要）
- Phase D2（新規追加モーダル）deploy + 動作確認完了
- GAS 全プロジェクトの git 同期監査完了（schedule-reverse-sync / village-schedule-sync の 2 standalone を git 化、伊藤さん管理の bound「無題のプロジェクト」は方針通り取り込まず）
- `gas/transferServiceRecords.gs` 重複削除
- `docs/RULES.md` Rule 4 に bound vs standalone 区別を加筆
- `docs/gas/README.md` 全面改訂（3 GAS の関係性マップ）

### 🚧 残タスク

#### A. schedule-editor 「🛟 強制リセット」ボタン deploy（commit `9e42991` 済、deploy 未確認）
- スマホで詰まった時の救済策として実装済（commit/push 済）
- deploy 手順: `cd ~/village-tsubasa && firebase deploy --only hosting`（Functions は無変更なので Hosting だけ）
- 動作確認: ボタンが「🔄 再読み込み」の右隣に薄オレンジで表示 → クリック → 確認ダイアログ → OK → リロードされてログイン状態は保持

#### B. 【新規プロジェクト】ヘルパーセルフマッチング — 検証 & 設計フェーズ

**奥原さんの構想**:
- 第1段階（管理者経由）: ヘルパーが「未割当の支援」を見て「入れます」をチェック → 管理者に通知 → 管理者が利用者に確認 → マッチしたらヘルパーに連絡（既存の運用フローをアプリ上に乗せる）
- 第2段階（自立型 / 将来）: 管理者を介さずヘルパー → 利用者の直接マッチング、優先順位付きの推薦
- 優先順位は **管理者の評価** で決める

**4/28 夜に決まったこと**:
- データモデル: 案2 採用（新テーブル `schedule_claims`、schedule_id + helper_email + status + 優先順位スコア + 時刻）
- 管理者通知: 案推奨（village-admin の画面バッジ + 1日1回サマリメール）
- 候補スケジュールの定義: パターン A のみ（後述）

**4/28 夜に検証したこと**:
- 仮説「黄色行（未割当）は GAS が Supabase に送らないかも」→ **誤り**。GAS の `SKIP_BG_COLORS` はグレー4種のみ。黄色は通常通り送られる
- → ヘルパー候補リストは Supabase の `schedule` テーブルから直接取れる
- 実データから 3 パターン発見:
  - **A. 純粋な未割当**: client あり、name 空、helper_email null、時刻あり（候補に出す）
  - **B. 名前だけある（メール未登録）**: client あり、name "真望" 等、helper_email null（候補に出さない、既割当扱い）
  - **C. 特殊メモ・不完全行**: 「大田生活実習所　休み」、時刻 null 等（候補に出さない）

**フィルタ条件（候補リスト用）**:
```sql
WHERE
  helper_email IS NULL
  AND deleted_at IS NULL
  AND date >= CURRENT_DATE
  AND (name IS NULL OR TRIM(name) = '')   -- パターン B 除外
  AND client IS NOT NULL                  -- パターン C 除外
  AND TRIM(client) <> ''
  AND start_time IS NOT NULL
```

**次に進める順番**:
1. 上記フィルタで未来の候補件数を確認（規模感）
2. パターン B の「真望」さんは何者か奥原さんに確認（実在のヘルパー？フィクション？メール登録すべき？）
3. パターン C の「休み」行などは個別 schedule に入れる運用を見直すか確認
4. `schedule_claims` テーブルの DDL を提案 → Supabase で実行
5. ヘルパー側 API + UI 実装（候補一覧 + 「入れます」ボタン）
6. village-admin 側のバッジ + メール通知（村つばさリポではなく **village-admin リポ** での作業に切り替え）

#### C. 編集権限を他 3 名に戻す（保留中）
- 現状 `can_edit_schedule = true` は奥原さんのみ（Phase B 時にロックした）
- 奥原さんから「まだやらなくていい、時が来た時で」と保留中（4/28 夜）
- スプレッドシートが固まった等で困った時に再開
  ```sql
  UPDATE admin_users
  SET can_edit_schedule = true
  WHERE email IN (
    'inachichoco@gmail.com',
    'tsukada.kouji610@gmail.com',
    'yutaka.ito1994@gmail.com'
  );
  ```

#### D. Phase E（コピペ・一括編集）— 保留中
- 奥原さんから「2 は様子見てから進める」と保留（4/28 夜）
- 候補機能: 同一行を複数日に複製 / 列フィルタの記憶 / 月またぎコピー
- 現場で 1〜2 週間使ってから判断する方針

#### E. 電子契約（contracts）ルータの復活
- **CloudSign の Client ID / Webhook Secret は取得できましたか？**
  - 背景: 2026-04-26 の Phase B デプロイ時、CloudSign secret 未設定で `firebase deploy` がインタラクティブ入力を要求してきたため、`functions/src/index.ts` の contracts ルータを一時コメントアウトした
  - 該当箇所: `import { contractsRouter } ...`（29行目付近）と `app.use("/contracts", ...)` `app.use("/api/contracts", ...)`（97行目付近）
  - 復旧手順:
    1. `firebase functions:secrets:set CLOUDSIGN_CLIENT_ID`（CloudSign の値）
    2. `firebase functions:secrets:set CLOUDSIGN_WEBHOOK_SECRET`（CloudSign の値）
    3. `index.ts` のコメントアウトを外す
    4. `npm run build && firebase deploy --only functions:api`
  - もし CloudSign 契約自体がまだなら、このタスクは見送り。ヘルパーさん影響なし（一度も deploy されていないため）

---

## 2026-04-28 [village-tsubasa] gas/transferServiceRecords.gs 削除 + RULES.md 加筆

### 削除: `gas/transferServiceRecords.gs`

- 2026-04-26 に commit したファイルだが、内容は
  `gas/village-schedule-sync/★サービス記録内容転送.gs`（奥原 standalone
  「【ビレッジつばさ】全体スケジュール」内）と機能重複していた
- 「サービス記録転送」という独立した GAS プロジェクトは **存在しない** ことが確認できた
  （シート名であり、関数 `transferServiceRecords()` は standalone 内に存在）
- 重複ファイルを残すと:
  - 次の人が「git にあるから安心」と勘違いするリスク
  - 古い形式（`runCheckFromButton` 公開、`onOpen` メニュー）を真似してしまうリスク
- → 安全側で削除

### `docs/RULES.md` Rule 4 を加筆

GAS の取扱について、以下の区別を明文化:

- **奥原管理（git で保管・触ってOK）**:
  - 「スケジュール逆同期」 standalone
  - 「【ビレッジつばさ】全体スケジュール」 standalone
- **伊藤さん管理（触らない・git に取り込まない）**:
  - 「全体スケジュール」スプレッドシートにバインドされた **「無題のプロジェクト」**
- 全体マップは `gas/README.md` 参照

これで次のチャットの Claude も、bound vs standalone の区別 / 他者管理範囲を
理解した上で作業できる。

### 影響範囲

- 本リポジトリ内のみ
- 本番 GAS / Firebase / Supabase いずれにも変更なし
- ヘルパーさんの閲覧・操作に影響ゼロ

### 追加確認: `gas/village-schedule-sync/スケジュール転送ボタン.gs` 実環境照合 ✅

宿題として残っていた「実 GAS 上のコード = git のコードか」の照合を実施。
奥原さんから提供された実画面（「スケジュール転送」シート: A=実行者名 / B=チェックボックス / C=結果 / D=時刻）と git 上のコードを突き合わせた結果、**完全一致** を確認:

| 確認項目 | 実環境 | git 側 (`スケジュール転送ボタン.gs`) |
|---|---|---|
| シート名 | `スケジュール転送` | `if (sheet.getName() !== 'スケジュール転送') return;` |
| A列 | 実行者名 | `nameCell = sheet.getRange(row, 1)` |
| B列 | チェックボックス | `if (col !== 2) return;` |
| C列 | 「転送完了」 | `resultCell.setValue('転送完了')` |
| D列 | 実行日時 | `timeCell.setValue(new Date())` |

役割は「他のメンバー（伊藤さん等）がスプレッドシートを編集した後、レ点でチェックを入れると転送が走る」ハンドラ。`onEditScheduleTransferCheckbox` が
`testCollectScheduleRowsPreviewCalendar202605Week1()` を呼び出して結果を C/D/E 列へ書き戻す。

→ **修正不要、git 側はそのまま有効**。これで GAS 同期監査の宿題は全て完了。

---

## 2026-04-28 [village-tsubasa] GAS「【ビレッジつばさ】全体スケジュール」スタンドアロン版を git に追加 + GAS 構成整理

「全体スケジュール」スプレッドシートに関わる Apps Script は **3 種類** あることが
今回の整理で判明:

| 役割 | 名前 | 所有者 | git 取り込み |
|---|---|---|---|
| スプレッドシートにバインド | **無題のプロジェクト** | **伊藤さん** | ❌ 取り込まない（他者管理） |
| 奥原のスタンドアロン #1 | **【ビレッジつばさ】全体スケジュール** | 奥原 | ✅ `village-schedule-sync/` |
| 奥原のスタンドアロン #2 | **スケジュール逆同期** | 奥原 | ✅ `schedule-reverse-sync/` |

### 今回の追加

- `gas/village-schedule-sync/コード.gs`（実環境では空ファイル）
- `gas/village-schedule-sync/appsscript.json`（既知の Web App 設定と同じパターン）
- `gas/README.md` を全面改訂し、3 種類の Apps Script 関係性 + ファイル対応表を明示

### 重要な方針

- **「無題のプロジェクト」（伊藤さんがバインド script として運用）は git に取り込まない**
  - 理由: 他者管理のものを git 化すると即古くなり「git にあるから安心」と誤認するリスク
  - バックアップが必要かどうかは伊藤さんと別途相談する
- **奥原のスタンドアロン 2 つは git で保管**（ロスト防止）

### URL

- 奥原 standalone「【ビレッジつばさ】全体スケジュール」:
  `script.google.com/home/projects/11ogu_Oy_47o8Ox7lye1YVtz0ypfMKKOt0vpuN83JdHpYyIXM_08dasxT/edit`
- 伊藤 bound「無題のプロジェクト」:
  `script.google.com/u/0/home/projects/1JO5ftmtOJn9bdffXgRCVz21DvNkIU6KDRAJCDB_LVOBsRW8XNrjhA8ad/edit`

### 残タスク（次回チャット）

- `gas/transferServiceRecords.gs`（フラット配置）の扱い:
  - 内容が `village-schedule-sync/★サービス記録内容転送.gs` とほぼ同一
  - 「サービス記録転送」 GAS プロジェクトが独立して存在しているなら
    `gas/service-record-transfer/` に移動
  - 存在しない（= 統合済み）なら本ファイルを削除
  - **次回 Apps Script ホーム画面のスクショで確認 → 判断**

### 影響範囲
- 本リポジトリ内のみ（git 保管追加だけ、本番 GAS 環境への変更なし）

### 関連 commit
- （commit 直前）

---

## 2026-04-28 [village-tsubasa] GAS「スケジュール逆同期」プロジェクトを git 管理に取り込み

GAS 全ファイル git 同期チェックの一環。これまで Apps Script 環境にしか
存在しなかった「スケジュール逆同期」プロジェクトのソースを git に登録した。
**ロジック変更ではなくソースの保管のみ**（Rule 4 の事前共有は不要）。

### 背景

- 2026-04-26 の `transferServiceRecords.gs` 修正時に、`gas/` ディレクトリには
  そのファイルしか入っていないこと（他に「スケジュール逆同期」「全体スケジュール」
  の 2 プロジェクトが本番でだけ動いていること）が発覚
- 同種の git 未追跡パターンは過去 3 回（2026-04-19 main.js / 2026-04-26
  transferServiceRecords / 2026-04-26 feedback.ts）発生しており、ロスト
  リスクが高い

### 取り込んだファイル（5 個 / `gas/schedule-reverse-sync/`）

| ファイル | 役割 |
|---|---|
| `appsscript.json` | マニフェスト（webapp = ANYONE_ANONYMOUS） |
| `コード.gs` | doPost / doGet エンドポイント、`handleAdd` / `handleEdit` / `handleDelete` |
| `records_export.gs` | 居宅介護・移動支援の実績記録票生成（テンプレートに流し込み） |
| `sheet_auto_create.gs` | 月次自動化（毎月15日 00:05）+ `flushScheduleToSheet_` で Supabase → シート流し込み |
| `月間スケジュール作成.gs` | 週シート 6 枚生成 + 日本祝日判定（`getJapaneseHolidays_`） |

### 同時整備

- `gas/README.md` を新設し、3 プロジェクトの位置付け / ファイル対応表 /
  スクリプトプロパティ仕様 / Web App デプロイ設定 / 月次トリガーの設置方法 /
  Apps Script ⇄ git の同期ワークフロー を記載
- 将来的には clasp 導入で自動 diff 可能（README に明記）

### 残作業

- **「【ビレッジつばさ】全体スケジュール」プロジェクト**（`★supabase転送本体.gs`）
  はまだ取り込めていない。次セッションで取り込み予定
- **「サービス記録転送」プロジェクト**（既存の `gas/transferServiceRecords.gs`）
  も他にファイルがあるか確認が必要

### 影響範囲

- 本リポジトリ内のみ（git 管理に追加しただけで、本番 GAS 環境への影響なし）
- 既に動いているスクリプトを変更したわけではない

### 関連 commit
- （commit 直前）

---

## 2026-04-28 [village-tsubasa] schedule-editor Phase D2: 新規予定の追加（モーダル UI）

Phase D1（削除・ゴミ箱・復元）の deploy・動作確認 OK 後に実装。
これでスプレッドシートの代替として **CRUD すべて揃った**（Create / Read / Update / Delete）。

### 仕様

- ツールバーに「＋ 新規追加」ボタン
- クリックでモーダルダイアログを表示
- 入力項目（必須は日付・利用者）:
  - 日付（`<input type="date">` で OS 標準のカレンダーピッカー）
  - 利用者（必須・テキスト）
  - ヘルパー（任意・テキスト）
  - 開始時間 / 終了時間（任意・スマート時刻整形 `915` → `09:15`）
  - 配車・内容・概要・受給者証番号（任意）
- 「追加する」で API 呼び出し → 成功なら表示中の月に行を追加
- ESC キーまたは背景クリックでキャンセル

### 自動補完（バックエンド側）

| カラム | 値 |
|---|---|
| `id` | Supabase が `gen_random_uuid()` で自動採番 |
| `helper_email` | 入力された `name` で `helper_master` を検索、見つかれば自動セット |
| `source_key` | `null`（editor 由来の行はスプレッドシート同期キー無し） |
| `synced_to_sheet` | `false`（GAS 月次フラッシュで反映） |
| `created_at` / `updated_at` | Supabase デフォルト |
| `deleted_at` | `null` |

### バリデーション

- 日付: `YYYY-MM-DD` 形式 + 実在チェック
- 利用者: 空白不可
- 時刻: HH:MM 範囲チェック（共有ユーティリティ `normalize.ts` を update.ts と共通化）
- 範囲外（25:00 など）は 400 エラー

### 新規 / 変更ファイル

| 種別 | パス | 内容 |
|---|---|---|
| 新規 | `functions/src/scheduleEditor/normalize.ts` | 時刻 / テキスト / 日付の正規化を集約 |
| 新規 | `functions/src/scheduleEditor/create.ts` | INSERT + helper_email 自動補完 |
| 変更 | `functions/src/scheduleEditor/update.ts` | normalize.ts を import、時刻整形ロジック削除（DRY） |
| 変更 | `functions/src/index.ts` | `POST /api/schedule-editor/create` をマウント |
| 変更 | `public/schedule-editor/index.html` | 「＋ 新規追加」ボタン + モーダル DOM |
| 変更 | `public/schedule-editor/main.js` | モーダル開閉 / 送信 / ESC・背景クリック対応 |
| 変更 | `public/schedule-editor/style.css` | モーダルスタイル + create-btn |

### 想定運用フロー（CHANGELOG 既出のフローを再掲）

1. 利用者が user-schedule-app で予定追加 → id 自動生成、`synced_to_sheet = false`
2. GAS 月次フラッシュ → スプレッドシートに反映、`synced_to_sheet = true`
3. 不備があれば管理者が schedule-editor で:
   - 編集（Phase C） / 削除（Phase D1） / 新規追加（**Phase D2 ✅**）
4. 編集・追加・削除した行は `synced_to_sheet = false` に戻る → 次の月次フラッシュで反映

### deploy 手順（奥原さん）

```bash
cd ~/village-tsubasa
git pull origin claude/setup-multi-app-dev-1y2PR
cd functions && npm run build && cd ..
firebase deploy --only functions:api,hosting
```

SQL の追加変更は無し（schedule_web_v は Phase D1 で更新済み、INSERT は schedule
テーブル直接なので view 不要）。

### 動作確認チェックリスト

- 「＋ 新規追加」ボタンを押すとモーダルが開く
- 日付に表示中月の 1 日が初期セットされる
- 利用者を空のまま「追加する」→「利用者は必須です」エラー
- 時刻 `915` → `09:15` で保存される
- 追加成功 → 表示中月のグリッドに行が出る + 緑「追加しました」
- 別月の日付で追加 → 緑表示は出るが現在のグリッドには出ない（その月に切り替えれば見える）
- ESC キー / 背景クリックでモーダルが閉じる
- ヘルパー名を `helper_master` に存在する名前にすると `helper_email` が自動入る
- ヘルパーアプリ（today-schedule 等）でも追加した予定が正しく表示される

### 影響範囲

- `schedule` テーブルへの INSERT が editor からも行われるようになる（user-schedule-app と GAS に並ぶ第3の経路）
- `synced_to_sheet = false` でスプレッドシート月次フラッシュ対象に乗る

### 関連 commit
- （Phase D2 完成 commit、本記載時点で push 直前）

---

## 2026-04-27 [village-tsubasa] schedule-editor Phase D1: 論理削除 + ゴミ箱 + 復元

Phase C のセル編集に続き、行ごとの削除（論理削除）と復元機能を追加。
**未 deploy**（奥原さんのレビュー後 deploy 予定）。

### 仕様

- 各行右端に「🗑 削除」ボタン → 確認ダイアログ → `deleted_at = now()` をセット
- ツールバーに「🗑 ゴミ箱を表示」トグル → ゴミ箱モード
- ゴミ箱モード時:
  - 過去 90 日に削除された行を新しい順に表示（最大 500 件）
  - 月切替コントロールはグレーアウト
  - 各行右端のボタンが「↩ 復元」に変わる
  - main-screen に薄赤系の背景でモードを区別
  - セル編集不可（ガード）
- 復元: 確認ダイアログ → `deleted_at = null` に戻す

### 新規 / 変更ファイル

| 種別 | パス | 内容 |
|---|---|---|
| 新規 SQL | `sql/2026-04-27_schedule_editor_phase_d.sql` | `schedule_web_v` を更新（`WHERE s.deleted_at IS NULL` を追加）+ `security_invoker = true` |
| 新規 | `functions/src/scheduleEditor/delete.ts` | POST /delete: 楽観ロック付き論理削除、`synced_to_sheet = false` リセット |
| 新規 | `functions/src/scheduleEditor/restore.ts` | POST /restore: `deleted_at = null` に戻す（楽観ロック不要） |
| 新規 | `functions/src/scheduleEditor/listTrash.ts` | GET /trash: 削除済み一覧（90日デフォルト、最大500件） |
| 変更 | `functions/src/index.ts` | 新エンドポイント 3 つをマウント |
| 変更 | `public/schedule-editor/index.html` | ゴミ箱トグルボタン追加 + フッター文言更新 |
| 変更 | `public/schedule-editor/main.js` | viewMode 切替 + 削除/復元 + 操作カラム + 確認ダイアログ |
| 変更 | `public/schedule-editor/style.css` | ゴミ箱モード視覚差別化 + アクションボタン |

### `schedule_web_v` の view 更新が大きな影響範囲

- 影響を受けるエンドポイント（全て削除済み行を**自動的に除外**するようになる）:
  - `/api/schedule-list` (schedule-editor 自身)
  - `/api/today-schedule` / `/api/today-schedule-all`（ヘルパー一覧）
  - `/api/tomorrow-schedule` / `/api/tomorrow-schedule-all`
  - `/api/today-helper-summary` / `/api/tomorrow-helper-summary`
  - `/api/next-helper-schedule`
  - 通知系（`scheduledNotifications.ts`）
- これは**期待動作**（削除した予定はヘルパーアプリにも表示されない）
- Phase A で `deleted_at` 列を追加して以来、まだ削除操作はしていないため、view 更新時点で表示が変わる行はゼロのはず

### 行追加（D2）は次回セッションへ

- 理由: schedule テーブルの `beneficiary_number` / `source_key` の初期値方針が要相談
- 当面は新規予定の追加はスプレッドシートで継続可能

### deploy 手順（奥原さん 4/27 朝以降）

1. **SQL 実行（必須・最初）**:
   - Supabase Dashboard → SQL Editor
   - `sql/2026-04-27_schedule_editor_phase_d.sql` の内容を貼り付けて Run
   - エラーが出たら deploy しない（CHANGELOG の rollback SQL で view を元に戻す）
2. **コード deploy**:
   ```bash
   cd ~/village-tsubasa
   git pull origin claude/setup-multi-app-dev-1y2PR
   cd functions && npm run build && cd ..
   firebase deploy --only functions:api,hosting
   ```
3. **動作確認**:
   - https://village-tsubasa.web.app/schedule-editor/
   - 任意の行で「🗑 削除」→ 確認 → 行が消える
   - 「🗑 ゴミ箱を表示」→ 削除した行が出る
   - 「↩ 復元」→ 戻る
   - 通常表示に戻る → 復元した行が見える
   - ヘルパーアプリ（today-schedule 等）でも削除した予定は出てこないことを確認

### 関連 commit
- （Phase D1 完成 commit、本記載時点で push 直前）

### 次回チャットで Claude が確認すべきこと（追加）

#### D. Phase D1 動作確認の結果は？
- 削除 → ゴミ箱 → 復元の往復が動いたか？
- ヘルパーアプリ側で削除済み予定が消えているか？
- 何か問題あれば、それを直してから D2（行追加）に進む

---

## 2026-04-27 [village-tsubasa] schedule-editor Phase C: セル編集 + 楽観ロック保存

Phase B（読み取り専用）に続き、AG Grid のセルを直接編集できるようにした。
スプレッドシートの代替として実用レベルになった。

### 新規ファイル
- `functions/src/scheduleEditor/update.ts` — 編集 API ハンドラ
  - 認可チェック（`admin_users.can_edit_schedule = true`）
  - 楽観ロック: `expectedUpdatedAt` と DB 上の `updated_at` を比較
  - 不一致なら 409 Conflict 返却 → フロントが該当月をリロード
  - フィールドマップ: `helperName` → `name`, `userName` → `client`, etc
  - 時刻フィールドのスマート整形:
    - `"915"` → `"09:15"`
    - `"2340"` → `"23:40"`
    - `"9:15"` → `"09:15"`
    - `"9"` → `"09:00"`
    - 範囲外（`25:00` など）はエラー

### 変更ファイル
- `functions/src/scheduleList.ts` — レスポンスに `updatedAt` を追加（楽観ロック用）
- `functions/src/index.ts` — `POST /api/schedule-editor/update` をマウント
- `public/schedule-editor/main.js`:
  - 日付以外の 7 列を `editable: true`
  - `onCellValueChanged` で自動保存
  - 保存中（茶）/成功（緑）/エラー（赤）の状態を toolbar status に表示
  - 競合時は自動で月リロード（1.2秒後）
  - **日付列を `M/D(曜)` 形式の valueFormatter で整形**（ソート・保存は ISO 形式のまま）
- `public/schedule-editor/style.css` — `.is-saving` / `.is-success` の色付け
  + 編集中セルのマーカー（背景色 + 茶色枠）
- `public/schedule-editor/index.html` — フッター文言を「ダブルクリックで編集」に更新

### 編集仕様
| 列 | 編集可？ | 備考 |
|---|---|---|
| 日付 | ❌ | 同期影響大、Phase D 以降 |
| ヘルパー | ✅ | プレーンテキスト |
| 利用者 | ✅ | 〃 |
| 開始 | ✅ | スマート整形（`915` → `09:15`） |
| 終了 | ✅ | 〃 |
| 配車 | ✅ | プレーンテキスト |
| 内容 | ✅ | 〃 |
| 概要 | ✅ | 〃 |

### 同時編集対策
1. フロント: 各行の `updatedAt` を保持（rowData の一部）
2. 保存時: `{id, field, value, expectedUpdatedAt}` を POST
3. サーバ:
   - SELECT で現在の `updated_at` を取得 → `expectedUpdatedAt` と比較
   - UPDATE 時にも `eq("updated_at", expectedUpdatedAt)` を二重で WHERE
   - 0 行更新 = 競合 → 409 Conflict
4. フロント: 競合検知 → 該当月を自動リロード

### 動作確認（2026-04-27）
- 任意セル編集 → Tab 確定 → 「保存しました」緑表示 ✅
- 時刻 `915` 入力 → `09:15` で保存 ✅
- 日付列を `4/25(土)` 形式で表示 ✅
- 1738件 / 月のスケジュールでパフォーマンス問題なし

### 関連 commit
- `b2b9345` — Phase C 本体実装
- `b4977b1` — 日付列を `M/D(曜)` 表記に
- `7f0b89a` — 時刻入力スマート整形

### 影響範囲
- **`schedule` テーブルへの UPDATE が発生する**（これまで Read-only だった）
- 影響を受ける可能性がある下流:
  - GAS「【ビレッジつばさ】全体スケジュール」の `★supabase転送本体.gs`
    （schedule → スプレッドシート同期）
  - `synced_to_sheet` フラグは現状 false にリセットしていない
    → 月次フラッシュ（毎月15日）で再同期されない可能性あり
  - **Phase D 以降で要確認**（編集行の `synced_to_sheet = false` リセット）

### 制限事項（Phase D 以降）
- 行追加 / 論理削除 / ゴミ箱 → Phase D
- コピペ / 一括編集 → Phase E
- 日付列の編集 → 現状は新規行追加（Phase D）で代替

---

## 2026-04-26 [village-tsubasa] schedule-editor Phase B 本番リリース + 緊急復旧作業

Phase B のコードを本番に出すまでに **3 つの予期せぬ問題** が連続発覚し、その復旧と
ロック方針の確立まで含めて完了させたセッション。記録のため詳細に残す。

### 問題①: `feedback.ts` / `trainingReport.ts` が git に存在しない（最初から）

- 症状: Mac で `npm run build` 実行時、TypeScript が `Cannot find module './feedback'`
  と `'./trainingReport'` でエラー → `firebase deploy` できず
- 原因調査:
  - 2026-04-14 の commit `98435bc`（落ち着き確認システム追加）で `index.ts` から
    `import { ... } from "./feedback"` と `... from "./trainingReport"` が追加された
  - しかし**該当ソースファイル `feedback.ts` / `trainingReport.ts` は git に
    一度も追加されていなかった**（4 ブランチ全てに存在しない）
  - コンパイル後の `lib/feedback.js` / `lib/trainingReport.js` も git に無い
  - Mac 上にも完全に消失（Spotlight `mdfind`、`~/.Trash`、Desktop、`village-admin` 内、
    `user-schedule-app` 内、いずれも該当ファイル無し）
  - GitHub の全 4 ブランチ（main / v1.0-stable / feat/service-records-move /
    claude/setup-multi-app-dev-1y2PR）にも無い
  - つまり、**Mac でビルドした compile 出力 `lib/*.js` を `firebase deploy` で
    アップロードしていただけ**で、ソースは untracked のまま放置 → ある時点で消失
  - これは 2026-04-19 の `public/training-reports/main.js` 事件（git HEAD で空
    ファイル `e69de29` のまま放置）と同じ「git に上げ忘れ」パターン

- **Cloud Storage からの救出に成功**:
  - 本番 Cloud Functions の deploy zip は `gs://gcf-v2-sources-220052181950-asia-northeast1/api/function-source.zip` に保存されていた（最終 deploy: 2026-04-18）
  - 該当 zip をダウンロード・解凍 → `extracted/src/feedback.ts`（254行）と
    `extracted/src/trainingReport.ts`（500行超）を発見
  - 2 ファイルを `functions/src/` にコピー → ビルド成功
  - bonus: zip には `trainingMaterial.ts` も入っていたが、現 index.ts では未使用
    のためコピー対象外
  - 復旧 commit: `ecc9086`

- **教訓**:
  - Cloud Functions v2 の deploy zip には**ソース TS ファイルも全部入っている**
    （`tsconfig.json` の include 設定上）→ 万が一 git からロストしても救出可能
  - `gsutil ls gs://gcf-v2-sources-<project-number>-asia-northeast1/` で確認可能
  - 教訓③（後述）参照

### 問題②: CloudSign secret 未設定で deploy がブロック

- 症状: 復旧後に `firebase deploy` 実行 → `Enter a value for CLOUDSIGN_CLIENT_ID:`
  でインタラクティブ入力要求 → 進めない
- 原因:
  - `functions/src/contracts/providers/cloudsign.ts` が `defineSecret("CLOUDSIGN_CLIENT_ID")`
    と `defineSecret("CLOUDSIGN_WEBHOOK_SECRET")` を宣言している
  - README.md には「Phase 3 スタブで value() 到達しないので deploy ブロックされない」
    とあったが、実際は CLI が宣言を検出して**初回 secret 登録を要求**してきた
  - 2026-04-19 作成の contracts コードは**まだ一度も deploy されていない**
    （直前の deploy は 2026-04-18）

- 対処: `index.ts` から contracts 関連の 3 行を一時コメントアウト
  - `import { contractsRouter } from "./contracts/routes";`（29行目）
  - `app.use("/contracts", contractsRouter);`（96行目）
  - `app.use("/api/contracts", contractsRouter);`（97行目）
  - commit: `9e5ef9c`
  - **ヘルパーさん影響なし**（一度も deploy されていない機能のため）
  - 復活手順は冒頭の「次回チャットで確認」C 項参照

### 問題③: hidden 属性が効かず画面遷移しない

- 症状: Phase B deploy 完了 → ブラウザでログイン画面表示 → メール入力 →
  「確認」ボタン押下 → **無反応**（API は `{ok:true, canEdit:true}` を返している）
- 原因:
  - main.js は `authScreen.hidden = true; mainScreen.hidden = false;` で画面切替
  - しかし `style.css` で `.auth-screen { display: flex; }` が指定されており、
    HTML の `hidden` 属性（デフォルト `display: none`）を**上書きしてしまっていた**
  - 結果: `hidden = true` をセットしても auth-screen が消えず、main-screen の上に
    重なって認証画面が見え続けていた

- 対処: `style.css` に `[hidden] { display: none !important; }` を追加
  - commit: `22be2d2`
  - これで標準の `hidden` 属性が CSS の `display:` 指定より優先される

### ロック方針: テスト中は奥原さんだけアクセス可能

- 奥原さんから「現場の人間が混乱しないように、まず自分だけテストして、
  スプレッドシートが開かなくなった日に切り替えたい」との要望
- **対策**:
  - **URL 秘匿**: `public/index.html`（村つばさトップ）に schedule-editor への
    リンクを貼らない → URL を直接打たない人にはアクセス手段が無い
  - **DB ロック**: `admin_users.can_edit_schedule = true` を奥原さん 1 人に絞る
    ```sql
    UPDATE admin_users
    SET can_edit_schedule = false
    WHERE email IN (
      'inachichoco@gmail.com',
      'tsukada.kouji610@gmail.com',
      'yutaka.ito1994@gmail.com'
    );
    ```
  - 結果: `can_edit_schedule = true` のメールアドレス = `village.tsubasa_4499@icloud.com` のみ
- **Phase C 完成後の戻し方**:
  ```sql
  UPDATE admin_users
  SET can_edit_schedule = true
  WHERE email IN (
    'inachichoco@gmail.com',
    'tsukada.kouji610@gmail.com',
    'yutaka.ito1994@gmail.com'
  );
  ```

### 動作確認結果（2026-04-26 23:15 頃）

- URL: https://village-tsubasa.web.app/schedule-editor/
- ログイン: `village.tsubasa_4499@icloud.com` で成功
- 画面: 2026年4月の予定 **1738件** が AG Grid に表示される
- 全列正常表示: 日付 / ヘルパー / 利用者 / 開始 / 終了 / 配車 / 内容 / 概要

### この日の最終 commit

| commit | 内容 |
|---|---|
| `b9a7037` | Phase B 本体実装 |
| `ecc9086` | feedback.ts / trainingReport.ts を Cloud Storage から救出して復元 |
| `9e5ef9c` | contracts ルータ一時無効化（CloudSign secret 未設定対応） |
| `22be2d2` | hidden 属性が効かないバグ修正（[hidden] CSS 追加） |

### 影響範囲
- 本リポジトリ内のみ（Functions API / Hosting）
- 他アプリ（village-admin / user-schedule-app）への影響なし
- ヘルパーさん（村つばさ利用者）からは見えない（URL 秘匿 + DB ロック）

### 教訓③: ソース消失リスクの恒久対策

- **`functions/lib/` も `functions/src/` も git tracked にすること**
  - 現状: `lib/` は一部 tracked、一部 untracked と不統一
  - 推奨: 次回チャットで `functions/.gitignore` を整理して `lib/` を完全 ignore に
    変更し、ビルドは CI 側に任せる **か**、`lib/` を完全 tracked にして
    Mac でビルドしたものをそのまま commit する運用に統一
  - 現行のような「`lib/*.js` のうち一部だけ commit、しかも `src/*.ts` が
    ない」という状態は最悪のパターン
- **untracked ファイルは無視せず、`git status` で見た時に判断する習慣を**
  - 「Untracked files:」セクションに重要なソースが並んでいたら、
    削除しない限り `git add` する

---

## 2026-04-26 [village-tsubasa] schedule-editor Phase B: 読み取り専用 AG Grid 表示

Phase A（DB 列追加）に続き、`/schedule-editor/` 画面 + 認証 API を実装。
現状は読み取り専用。編集機能は Phase C で追加予定。

### 新規ファイル
- `functions/src/scheduleEditor/auth.ts` — 認証 API ハンドラ
  - `admin_users` テーブルから `email` を引いて `can_edit_schedule = true`
    のときのみ `{ ok: true, canEdit: true }` を返す
  - email は ilike（大文字小文字無視）で照合
  - 未登録 / 権限なし / 通信エラーで分岐したメッセージ返却
- `public/schedule-editor/index.html` — 認証画面 + メイン画面の2セクション
- `public/schedule-editor/main.js` — 認証フロー、AG Grid 初期化、月切替、
  クイックフィルタ、再読み込み（v31 API）
- `public/schedule-editor/style.css` — 村のつばさ標準パレット（茶 / ベージュ系）

### 変更ファイル
- `functions/src/index.ts`:
  - `import { handleScheduleEditorAuth } from "./scheduleEditor/auth"` を追加
  - `app.get("/schedule-editor/auth", handleScheduleEditorAuth)` と
    `/api/schedule-editor/auth` の両方をマウント
- `functions/lib/` — TypeScript ビルド成果物（自動生成）

### 認証フロー
1. 画面ロード → `localStorage` からメール取得
2. メールあれば自動で `/api/schedule-editor/auth` に問い合わせ
3. `can_edit_schedule = true` なら AG Grid 表示、それ以外はログイン画面に戻す
4. 「ログアウト」ボタンで localStorage クリア + 認証画面へ

### 表示機能
- AG Grid Community v31.3.4（CDN 経由、無料 / npm 不要）
- カラム: 日付（pinned 左、初期降順なし昇順）、ヘルパー、利用者、開始、終了、配車、内容、概要
- ソート、列フィルタ、リサイズ、クイックフィルタ（ヘルパー名 / 利用者名）
- 月切替（◀ ▶ ボタン）+ 再読み込みボタン
- 編集は無効（`editable: false`）

### 認証範囲
- Phase A で `can_edit_schedule = true` を設定した4名のメールアドレスのみ閲覧可
- それ以外は「権限がありません」表示でログインできない
- これにより、内部 4 人専用ツールとして位置付け

### 影響範囲
- 新規 API・新規ページのみ。既存機能・他アプリへの影響なし
- データソース: 既存の `/api/schedule-list`（schedule_web_v ベース）を流用。
  読み取り専用なので Supabase への書き込み無し
- デプロイ: Firebase Hosting + Functions 両方必要
  （Functions は新エンドポイント追加のため）

### 次のフェーズ
- **Phase C**: セル編集 + 楽観ロック保存（`schedule.updated_at` 比較）
- **Phase D**: 行追加 / 論理削除 + ゴミ箱画面
- **Phase E**: コピペ・一括編集など便利機能

### デプロイ手順（奥原さん）
```bash
cd ~/village-tsubasa
git pull origin claude/setup-multi-app-dev-1y2PR
firebase deploy --project village-tsubasa
# （Hosting と Functions 両方デプロイ）
```

その後、`https://village-tsubasa.web.app/schedule-editor/` を開いて
4名のメールでログイン → 月のスケジュールが表示されれば成功。

## 2026-04-26 [village-tsubasa] schedule-editor Phase A: DB 列追加（論理削除 + 編集権限）

スプレッドシート的なスケジュール編集 HTML（`/schedule-editor/`）の構築開始。
今回は Phase A（DB 列追加）のみ。実 UI / API は Phase B 以降で実装。

### 変更内容
- `schedule.deleted_at TIMESTAMPTZ NULL` 列を追加
  - 論理削除用。NULL = 有効、値あり = 削除済み
  - Partial index `idx_schedule_deleted_at` も追加（NULL 行のみ対象、軽量）
  - schedule-editor から「削除」しても元データは残り、ゴミ箱画面（Phase D）で復元可能
- `admin_users.can_edit_schedule BOOLEAN NOT NULL DEFAULT false` 列を追加
  - schedule-editor で編集権限を持つ人を判定する allow-list
  - デフォルト false（誰も編集できない安全側）
  - 既存 admin_users は「ダッシュボード閲覧 allow-list」、`can_edit_schedule = true` の
    人はその中でさらに編集権限あり、という二段構え
- 編集権限を持つ4名のメールに `can_edit_schedule = true` を設定（村のつばさ社内のみ）
- 誤入力データ `email = 'あなたのGmailアドレス'`（過去の SQL プレースホルダーが
  そのまま挿入されてた）を削除

### 適用 SQL
- `sql/2026-04-26_schedule_editor_phase_a.sql`（再現用、本番には 2026-04-26 に
  既に適用済み）

### 影響範囲
- 新列はすべて nullable / default 付き → RULES.md ルール2 準拠
- village-admin 側（村上翼さん）は `admin_users` を SELECT してるが新列を
  無視するため後方互換 → RULES.md ルール4 準拠
- user-schedule-app は `admin_users` / `schedule.deleted_at` を参照していないので影響なし

### 次のフェーズ（仮）
- **Phase B**: 読み取り専用の AG Grid 表示画面 `/schedule-editor/` を新規作成
- **Phase C**: セル編集 + 保存 + 認証（`admin_users.can_edit_schedule` 連携）
- **Phase D**: 行追加 / 削除 + ゴミ箱画面
- **Phase E**: コピペ・一括編集など便利機能

### 関連
- 機能要望: 奥原翼（2026-04-26 チャット）
- 設計議論: 同チャットで楽観ロック / GAS 衝突 / 認証 を確定
- 関連構想: `docs/FUTURE_IDEAS.md`「利用者情報マスタ + Google マップ連携」（後着手）

## 2026-04-26 [village-tsubasa] 4 schedule ページの formatTimeRange を統一

`tomorrow-schedule-all` だけだった「end_time なしでも start_time を表示」
パターンを、他3ページにも展開して4ページとも同じ挙動に統一。

### 変更前
| ファイル | パターン |
|---|---|
| `today-schedule/main.js` | `${startTime}〜`（〜あり、修正済み） |
| `today-schedule-all/main.js` | `"時間未設定"`（未対応） |
| `tomorrow-schedule/main.js` | `${startTime}〜`（〜あり、修正済み） |
| `tomorrow-schedule-all/main.js` | `${startTime}`（〜なし、2026-04-25 修正） |

### 変更後（4ページとも統一）
```js
function formatTimeRange(item) {
  const startTime = getDisplayValue(item.startTime, "");
  const endTime = getDisplayValue(item.endTime, "");
  if (startTime && endTime) return `${startTime}〜${endTime}`;
  if (startTime) return `${startTime}〜`;
  return "時間未設定";
}
```

### 変更ファイル
- `public/today-schedule-all/main.js`: 新規パターン追加（4行追加）
- `public/tomorrow-schedule-all/main.js`: `startTime` のみ → `${startTime}〜` に統一

### 影響範囲
- village-tsubasa の `public/` 配下のみ。Functions / Supabase / 他アプリへの影響なし
- `today-schedule` / `tomorrow-schedule` は無変更（既に正しい形だった）
- デプロイは Firebase Hosting のみ

## 2026-04-26 [village-tsubasa] GAS「サービス記録転送」を service_role キー対応 + 日付全角カッコ対応

2026-04-25 の RLS 移行後に GAS が壊れたため修正。2件のバグを連続して
潰す形になった。

### バグ1: anon キーで INSERT → RLS で 401
- `gas/transferServiceRecords.gs` が `SUPABASE_API`（anon キー）を使っており、
  RLS が ON になった `home_schedule_tasks` / `schedule_tasks_move` への
  INSERT が `42501 new row violates row-level security policy` で全件拒否
- 修正: スクリプトプロパティ名を `SUPABASE_SERVICE_KEY` に変更
  （他 GAS「スケジュール逆同期」「全体スケジュール」と命名統一）。
  後方互換のため `SUPABASE_API` も fallback で読む
- 奥原さん作業: GAS スクリプトプロパティに `SUPABASE_SERVICE_KEY` を追加
  （値は Supabase Dashboard → Settings → API → service_role キー）
- 関連コミット: `b83fbc9`

### バグ2: 日付の全角カッコ未対応 → 22007
- バグ1 修正後の再実行で、日付 `"4/25（土）"` が Supabase に渡って
  `22007 invalid input syntax for type date` エラーで全件拒否
- 原因: `formatDate` 関数の正規表現が `/\(.*?\)/g`（半角カッコのみ）で、
  シート A2 の全角カッコ `（土）` を除去できていなかった。さらに
  フォールバックが `return str` で変換失敗を握り潰していた
- 修正:
  - 正規表現を `/[（(].*?[）)]/g` に変更（全角・半角両対応）
  - フォールバックを `throw new Error("日付変換できません: " + str)` に
    変更（Supabase に不正値を渡す前に止める）
- 奥原さん作業: GAS スクリプトに最新コードを再貼り付け、再実行で動作確認 OK
- 関連コミット: `4da3da0`

### 影響範囲
- GAS のみの変更。Supabase / Firebase Functions / 他アプリへの影響なし
- 修正後、毎日の「サービス記録転送」シートからの転送が再び動作

### 教訓 / 副次的な気付き
- **git の `gas/transferServiceRecords.gs` が実 GAS 環境のコードと乖離していた**
  - 奥原さんが過去に GAS 上で全角カッコ対応版（formatDate_）に
    アップデート → しかし git に反映されておらず、古い半角版が残存
  - これは 2026-04-19 の `public/training-reports/main.js` 354行ロスト未遂と
    同パターン
  - 別途、`gas/` 配下の全 GAS ファイルが実環境と一致しているかの棚卸しが必要
    → FUTURE_IDEAS.md にメモ追加予定

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
