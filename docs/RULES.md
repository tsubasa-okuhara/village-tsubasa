# RULES — 3アプリ並行開発のルール

> **このドキュメントは新チャットが最初に読むルール集です。**
> 1分で読めて、これさえ守れば他アプリを壊さない、というレベルの厳選ルール。

対象アプリ:
- `village-tsubasa`（ヘルパー用）
- `village-admin`（管理者用、別リポ）
- `user-schedule-app`（利用者用、別リポ、GitHub Pages）

共有基盤: Supabase プロジェクト `pbqqqwwgswniuomjlhsh.supabase.co`

---

## ルール1. 作業開始時のチェックリスト

新しいチャットで作業を始める前に、**必ず**以下の順で読む:

1. `docs/CURRENT_STATE.md` — 3アプリの全体像とAPI/画面の一覧
2. `docs/CHANGELOG.md` — 直近1ヶ月の変更と影響範囲
3. 関係する機能の場合は `docs/SUPABASE_SCHEMA.md` の該当セクション

読まずに作業を始めて事故ったら、それはこのルールを破った責任。

## ルール2. テーブル変更は「追加は nullable / 削除は禁止」

共有 Supabase なので、**片方のアプリでテーブル構造を変えると他が壊れる**。

**OK:**
- 新しいテーブルを追加する
- 既存テーブルに **nullable な列** を追加する（default も付けると安全）
- 新しい index / view を作る（既存クエリを壊さない形で）

**NG（事故の元）:**
- 既存列を削除する
- 既存列の型を変更する
- 既存列を `NOT NULL` 必須化する
- 既存テーブルを削除・リネームする

どうしても削除・型変更が必要な場合: **新列 + 移行期間（1ヶ月）+ 他アプリの書き換え完了確認 + 旧列削除** の順に踏む。移行期間中に `CHANGELOG.md` へ明記。

## ルール3. API は破壊的変更をしない

既存エンドポイントのレスポンス形式を変える場合:

**OK:**
- レスポンスに新フィールドを**追加**する（既存クライアントは無視する）
- 新しいエンドポイントを追加する

**NG:**
- 既存エンドポイントを削除する（`/api/` プレフィックス付きの別名はOK）
- 既存フィールドを削除・型変更する
- 既存エンドポイントの HTTP メソッドや URL を変える

どうしても必要な場合: 新バージョンを別エンドポイント（例: `/api/v2/training-reports`）に追加し、旧エンドポイントを半年は残す。

## ルール4. 他アプリに触れる変更は事前共有

以下のいずれかに該当する変更は、着手前に奥原翼さんに確認:

- `SUPABASE_SCHEMA.md` の **⚠️ / ✅ 付きテーブル** に対する INSERT/UPDATE の挙動を変える
- 特に **`service_notes_move.sent_at`** / **`service_notes_home.final_note`・`memo`** / **`training_reports` の既存列** / **`schedule` テーブル** — これらは明確に複数アプリが触る
- `schedule_web_v` ビューの列構成を変える
- GAS のロジックを変える:
  - **奥原管理（git で保管・触ってOK）**: 「スケジュール逆同期」 / 「【ビレッジつばさ】全体スケジュール」standalone
  - **伊藤さん管理（触らない）**: 「全体スケジュール」スプレッドシートにバインドされた **「無題のプロジェクト」**（git にも取り込まない）
  - 全体マップは `gas/README.md` 参照
- Firebase Functions の Scheduler ジョブ（`notifyTodaySchedule` / `notifyTomorrowSchedule`）を変える

チャットの場合は **AskUserQuestion** で奥原さんに選択肢を出して確認。

## ルール5. 作業終了時に CHANGELOG.md を書く

その日のチャットで以下のいずれかを行ったら、`CHANGELOG.md` にエントリを追記:

- Supabase スキーマを変更した（テーブル/列/ビュー/index の追加・変更）
- API を追加/変更/削除した
- Scheduler ジョブを変えた
- GAS を変えた
- 他アプリから参照されるコード（`functions/src/` 配下）に非自明な変更を入れた

書式:
```
## YYYY-MM-DD [リポ名] 変更タイトル
- 変更内容
- 影響範囲: （他アプリへの影響、なければ「本リポ内のみ」）
- 関連コミット/PR: （あれば）
```

スキーマを変えた場合は `SUPABASE_SCHEMA.md` の該当テーブル + ファイル末尾の「更新履歴」にも追記。

## ルール6. user-schedule-app の特殊性

`user-schedule-app` は:
- GitHub Pages 静的サイト（Firebase Functions なし）
- Supabase anon キーで **直接** Supabase を叩く
- 116名の利用者に配布済み、更新展開に時間がかかる

このため:
- `schedule` テーブルに破壊的変更を入れると **一斉に利用者環境が壊れる**
- RLS を ON にする場合は、anon キーで SELECT/INSERT/UPDATE/DELETE できるポリシーを事前に整備
- user-schedule-app のコードを変更する場合は、**デプロイから反映まで利用者がブラウザをリロードする必要**があることを想定

## ルール7. 既知の「触ると危ない」ポイント

| 対象 | 注意点 |
|---|---|
| `service_notes_home.memo` の独自フォーマット | village-admin の `parseMemo` が `区分: / 主チェック: / 子チェック: / 補足:` のプレフィックスに依存 |
| `service_notes_home.final_note` の冒頭時刻 | village-admin の `parseTimeFromFinalNote` が `YYYY-MM-DD HH:MM:SS〜HH:MM:SS` の正規表現で抽出 |
| `schedule.helper_email` の比較 | `ilike`（大文字小文字無視）で行う（2026-04-04 以降） |
| `schedule_tasks_move` のカラム名 | 正規は `service_date`。`moveCheckService.ts:52` に `date` 参照のバグ疑いあり（2026-04 時点、未修正） |
| `schedule_web_v` ビュー | `functions/src/schedule*.ts` 複数ファイルから参照。列削除不可 |
| Supabase service_role キー | GAS スクリプトプロパティ `SUPABASE_SERVICE_KEY` に保存。**誤って別プロジェクトのキーを入れる事故が過去に発生**（2026-04-17 修正）。URL と一緒にチェックする |
| Firebase Functions Secret のキー名/値ミスマッチ | `village-admin` の `SUPABASE_SERVICE_ROLE_KEY` という Secret 名で **anon キー**が保存されていた事故（2026-04-25 修正）。RLS が OFF の間は気付けない隠れバグ。検証コマンド: `firebase functions:secrets:access SUPABASE_SERVICE_ROLE_KEY --project XXX \| node -e "const t=require('fs').readFileSync(0,'utf8').trim(); const j=JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()); console.log('role:', j.role, '\| ref:', j.ref);"` で role と ref を確認 |

## ルール8. 運用の段階化

このドキュメント運用は段階的に厳しくなります:

- **現在（第1段階・手動運用）**: 各チャットが `CURRENT_STATE.md` / `CHANGELOG.md` / `SUPABASE_SCHEMA.md` を手動で更新
- **次（第2段階・他リポ連携）**: `village-admin` / `user-schedule-app` の `README.md` と `CLAUDE.md` から本フォルダへのリンクを貼る
- **将来（第3段階・自動化）**: 週次スケジュールタスクで Supabase スキーマと git log を自動取得し `CURRENT_STATE.md` / `CHANGELOG.md` に追記。破壊的変更を検知したら奥原さんに通知

第3段階に進む前に、**まず手動運用で2〜4週間の定着期間**を設ける（自動化してから運用を変えると、自動化が足かせになる）。

## ルール9. 週次のリポジトリ健康診断

毎週金曜（または週初め）、各自で以下を実行:

```bash
bash ~/village-tsubasa/scripts/repo-health-check.sh
```

`~/Desktop` / `~/Documents` / `~/dev` / `~/Projects` 配下の git リポを自動検出し、各リポを以下で判定:

- 🟢 **健全**: GitHub と同期、未コミットなし
- 🟡 **注意**: 未push or 未コミットあり（意図的な作業中か確認）
- 🔴 **危険**: GitHub remote 未設定（どこにも push されていない = ロストリスク）

**運用ルール**:

- 🔴 のリポは**今週中に対応**（GitHub にリポ作成 → remote 追加 → push）
- 🟡 のリポは、未コミット・未pushが意図的か必ず確認。1週間以上 🟡 続いたら早めに片付け
- 2週連続で 🔴 → 「放置リポ」として整理候補に。本当に不要なら `_archive_review/` に退避

**過去にこれが原因で起きた事故**:
- 2026-04-19: `village-tsubasa` の `public/training-reports/main.js` (354行) が git HEAD 上で空ファイル (`e69de29`) のまま放置されていた事故。Firebase Hosting だけにデプロイ済みで、git に存在しなかった。→ ローカル消失 = ロストの危険。今回 commit `5207650` で正式登録
- 2026-04-21: `Desktop/v-sche-app` `Desktop/receipt_app` `Desktop/supabase-helper` `Desktop/pictweet2` 等の重複・放置リポジトリが多数発見。整理に時間を要した

## ルール10. アイデア蓄積の自動化（FUTURE_IDEAS.md 運用）

奥原翼さんが日々のチャット中に思いつくアイデア・構想・気づきを、忘れないうちに `docs/FUTURE_IDEAS.md` に蓄積する運用。

**役割分担**:
- **奥原さん**: チャットで自由に話す。粗くてOK、書きっぱなしでOK、言語化が甘くてもOK
- **Claude**: 会話の中から「将来構想」「改善アイデア」「新規事業の種」等を検出し、`FUTURE_IDEAS.md` に整理して追記

**Claude の判定基準**:

- 🧠 **即席メモに追記**（確認不要、黙って追記）
  - 「～したい」「～あったら便利」「～かも」等の軽い思いつき
  - 作業中に脱線して出てきた小ネタ
  - 技術メモ（あの時こうすれば良かった）
- 📝 **正式エントリに追記**（構造化して整理、3要素以上を含む場合）
  - 3つ以上の要素を含む構想（ゴール・手段・期限）
  - 新規事業・新機能・業務改善の骨子
  - 技術選定や方針判断の比較検討
  - 数週間〜1年単位の中長期ビジョン
- 🗑️ **残さない**
  - 単なる質問・確認
  - 作業中の単発コマンド
  - 感情的な発言（愚痴・疲れた系）
  - 後続の会話で明確に否定されたもの

**運用フロー**:

1. 奥原さんが自由に話す
2. Claude がアイデアを検出
3. **意図が明確** → 黙って追記（即席メモ or 正式エントリ）
4. **意図・文脈が曖昧** → Claude が質問して言語化を助ける → それから追記
5. 追記ごとの告知はしない（会話の流れを止めない）
6. **チャットの終わりに** 「今日は FUTURE_IDEAS に N 件追加しました」と一言報告
7. コミットはチャット終わりにまとめて 1 回（`chore: FUTURE_IDEAS に今日の着想を追記` 等）

**定期見直し（奥原さん担当）**:
- 月1回くらい `FUTURE_IDEAS.md` を見返す
- 実行フェーズに入ったものは `CURRENT_STATE.md` や別の正式なロードマップに昇格
- 実行しないと決めたものは **🗄️ 却下アーカイブ** セクションに移動（判断理由付き）

---

## 疑問が出たら

- 判断がつかない → AskUserQuestion で奥原翼さんに選択肢提示
- `SUPABASE_SCHEMA.md` の内容と実際の挙動が合わない → 実スキーマを優先。差分を `CHANGELOG.md` に記録して奥原さんに報告
- 本ルール自体を変えたい → 本ファイルの末尾「ルールの更新履歴」に追記してから変更

---

## ルールの更新履歴

- **2026-04-18** 初版作成（奥原翼）
- **2026-04-21** ルール9「週次のリポジトリ健康診断」を追加（奥原翼 + Claude Opus）。`scripts/repo-health-check.sh` を併設。背景: 4/19 の `main.js` 354行ロスト未遂と 4/21 の Desktop 整理で大量の重複/孤立リポが見つかった反省から
- **2026-04-21** ルール10「アイデア蓄積の自動化」を追加（奥原翼 + Claude Opus）。`docs/FUTURE_IDEAS.md` を新設。背景: 「1年後に大田区の福祉事業者にサービス提供」という中期ビジョンを含め、日々の思いつきを忘れずに蓄積するため
