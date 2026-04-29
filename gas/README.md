# gas/

> 村つばさ周辺で動いている **Google Apps Script (GAS) プロジェクト**のソースを git に保管する場所。
>
> GAS は本番環境（Apps Script 上）と git の二重管理になりやすく、過去に
> 「本番だけにあって git に無い」「逆に git だけが古い」事故が複数回起きた
> （2026-04-19 main.js / 2026-04-26 transferServiceRecords / 2026-04-26
> feedback.ts ）。この README はその再発防止のための整理。

---

## 全体マップ

「全体スケジュール」スプレッドシート（`1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ`）に
関わる Apps Script は **3 種類** ある:

| 役割 | 名前 | 所有者 | git |
|---|---|---|---|
| スプレッドシートにバインドされた script | **無題のプロジェクト**（GAS UI 上の名前） | **伊藤さん** | ❌ **取り込まない**（他者管理） |
| 奥原のスタンドアロン #1 | **【ビレッジつばさ】全体スケジュール** | 奥原 | ✅ `village-schedule-sync/` |
| 奥原のスタンドアロン #2 | **スケジュール逆同期** | 奥原 | ✅ `schedule-reverse-sync/` |

> ⚠️ **「無題のプロジェクト」は伊藤さんが単独で編集しているため、こちらが
> 触ったら本番事故になる**。git にも取り込まない方針。バックアップが
> 必要かどうかは伊藤さんと別途相談。

---

## プロジェクト一覧

### `village-schedule-sync/` — 「【ビレッジつばさ】全体スケジュール」（奥原のスタンドアロン）

- 役割: スプレッドシートのカレンダーシート群を読み取って Supabase に同期
  + サービス記録転送 + 居宅・移動の実績記録票生成
- Apps Script URL: `script.google.com/home/projects/11ogu_Oy_47o8Ox7lye1YVtz0ypfMKKOt0vpuN83JdHpYyIXM_08dasxT/edit`

| Apps Script 内のファイル名 | git 上のファイル名 |
|---|---|
| `appsscript.json` | `appsscript.json` |
| `コード` | `コード.gs`（実環境では空） |
| `★supabase転送本体` | `★supabase転送本体.gs` |
| `アドレス、受給者所セット` | `アドレス、受給者所セット.gs` |
| `★サービス記録内容転送` | `★サービス記録内容転送.gs` |
| `スケジュール転送ボタン` | `スケジュール転送ボタン.gs` |
| `対応可否シート移行` | `対応可否シート移行.gs`（one-shot 移行ツール、2026-04-29 追加） |

### `schedule-reverse-sync/` — 「スケジュール逆同期」（奥原のスタンドアロン）

- 役割: 利用者アプリ → スプレッドシートへの即時逆同期 Web App。
  doPost / doGet で add/edit/delete を受け、月次自動シート生成 + Supabase
  流し込みも担当。実績記録票生成も含む。
- Web App としてデプロイされ、`schedule.html` から fetch される

| Apps Script 内のファイル名 | git 上のファイル名 |
|---|---|
| `appsscript.json` | `appsscript.json` |
| `コード` | `コード.gs` |
| `records_export` | `records_export.gs` |
| `sheet_auto_create` | `sheet_auto_create.gs` |
| `月間スケジュール作成` | `月間スケジュール作成.gs` |

### `transferServiceRecords.gs`（フラット配置・要整理）

- 元の commit メッセージは「サービス記録転送」プロジェクトとして取り込んだ
  もの。しかし内容が `village-schedule-sync/★サービス記録内容転送.gs` と
  ほぼ同じで、今回の整理で **重複している可能性が高い** ことが判明
- **次回チャットで判断**:
  - そもそも「サービス記録転送」という独立 GAS プロジェクトがまだ存在するか？
  - 存在するなら `gas/service-record-transfer/` に移動
  - 存在しない（= `★サービス記録内容転送.gs` に統合済み）なら本ファイルを削除

---

## スクリプトプロパティ（コードに含めない・GAS UI で個別設定）

両スタンドアロンプロジェクト共通:

| キー | 値 |
|---|---|
| `SUPABASE_URL` | `https://pbqqqwwgswniuomjlhsh.supabase.co` |
| `SUPABASE_SERVICE_KEY` | （Supabase の Service Role Key、絶対に git に commit しない） |
| `SUPABASE_API` | （旧名、後方互換のため残してある場合あり。新規は SUPABASE_SERVICE_KEY） |

> ⚠️ **過去の事故**: 別プロジェクト（`xwnbdlcukycihgfrfcox`）の anon キーが
> 入っていた事故あり（2026-04-17 修正）。キーを更新するときは URL と
> 一緒に必ず `JWT.io` か `testCountAndKey()` で role/ref を確認する。

---

## Web App デプロイ設定（共通）

- 実行者: `USER_DEPLOYING`（自分）
- アクセス: `ANYONE_ANONYMOUS`（誰でも、`schedule.html` から fetch する都合）

## 月次トリガー（schedule-reverse-sync 側のみ）

- 関数: `monthlySheetAutoCreate_()`
- スケジュール: 毎月 15 日 00:05（JST）
- 登録: `installMonthlyTrigger_()` を一度だけ手動実行

---

## 同期ワークフロー（Apps Script ⇄ git）

GAS には clasp を使えば自動同期できるが、**今は手動運用**。

### Apps Script 側で変更があったとき

1. Apps Script エディタでコード編集 → 保存
2. 動作確認後、Apps Script のファイル全文を `git` 側のファイルに上書きコピー
3. CHANGELOG.md に「YYYY-MM-DD [リポ名] GAS 〇〇プロジェクト：△△を変更」を追記
4. `git commit -m "fix(gas-XX): ..."`

### git 側で変更したいとき

1. `git` 上でファイル編集
2. Apps Script エディタを開いて、対応するファイルに上書き貼り付け
3. Apps Script で動作確認（テスト関数 / Logger / 実 doPost）
4. OK なら `git commit + push`、NG なら一旦戻す

将来 clasp 導入時には `clasp pull` → `git diff` で自動チェック可能になる。
