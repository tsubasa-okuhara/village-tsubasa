# gas/

> 村つばさ周辺で動いている **Google Apps Script (GAS) プロジェクト**のソースを git に保管する場所。
>
> GAS は本番環境（Apps Script 上）と git の二重管理になりやすく、過去に
> 「本番だけにあって git に無い」「逆に git だけが古い」事故が複数回起きた
> （2026-04-19 main.js / 2026-04-26 transferServiceRecords / 2026-04-26
> feedback.ts ）。この README はその再発防止のための整理。

---

## プロジェクト一覧

| プロジェクト名 | フォルダ | 役割 |
|---|---|---|
| **サービス記録転送** | `transferServiceRecords.gs`（フラット配置） | スプレッドシート → Supabase。当月分のサービス記録を毎月一括転送 |
| **スケジュール逆同期** | `schedule-reverse-sync/` | 利用者アプリ → スプレッドシート。Web App として doPost を公開し、`schedule.html` から add/edit/delete を受け取ってシートに反映。月次自動シート生成 + Supabase 流し込みも担当 |
| **【ビレッジつばさ】全体スケジュール** | （未取得） | スプレッドシート ⇄ Supabase 双方向同期（`★supabase転送本体.gs`）。CHANGELOG / SUPABASE_SCHEMA に記載されているが git に未取り込み |

---

## ファイル対応表

### `schedule-reverse-sync/`（GAS プロジェクト名: スケジュール逆同期）

Apps Script ファイル名と git ファイル名は 1:1 対応。**ファイル名は変えない**こと（diff の精度が落ちる）。

| Apps Script | git |
|---|---|
| `appsscript.json` | `appsscript.json` |
| `コード` | `コード.gs` |
| `records_export` | `records_export.gs` |
| `sheet_auto_create` | `sheet_auto_create.gs` |
| `月間スケジュール作成` | `月間スケジュール作成.gs` |

### スクリプトプロパティ（コードに含めない・GAS UI で個別設定）

| キー | 値 |
|---|---|
| `SUPABASE_URL` | `https://pbqqqwwgswniuomjlhsh.supabase.co` |
| `SUPABASE_SERVICE_KEY` | （Supabase の Service Role Key、絶対に git に commit しない） |

> ⚠️ **過去の事故**: 別プロジェクト（`xwnbdlcukycihgfrfcox`）の anon キーが
> 入っていた事故あり（2026-04-17 修正）。キーを更新するときは URL と
> 一緒に必ず `JWT.io` か `testCountAndKey()` で role/ref を確認する。

### Web App デプロイ設定

- 実行者: `USER_DEPLOYING`（自分）
- アクセス: `ANYONE_ANONYMOUS`（誰でも、`schedule.html` から fetch する都合）

### 月次トリガー

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

---

## 健康診断（週次推奨）

```bash
# 各 .gs ファイルが Apps Script と一致しているか手動 diff
# （clasp 導入までは手動でファイル全文コピー → diff）
```

将来 clasp 導入時には `clasp pull` → `git diff` で自動チェック可能になる。
