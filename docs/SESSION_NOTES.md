# SESSION_NOTES — 作業の引き継ぎメモ

> **目的**: PC ↔ スマホ間 / チャット間で「いま何やってる」を見失わないためのメモ。
> CHANGELOG と違って、過去の記録ではなく **進行中の状態** を書く。
> 一段落したら CHANGELOG に正式に書き写して、ここはクリア / 次のテーマに更新。

最終更新: 2026-05-02 23:30（feedback フロント救出を新規追加）

---

## 🔴 進行中（今すぐの最優先タスク）: 「声のポスト」(/feedback/) フロント救出

### 状況
- 本番 `https://village-tsubasa.web.app/feedback/` が **Page Not Found**
- バックエンド `functions/src/feedback.ts` は **2026-04-26 commit `ecc9086`** で本番 zip から救出済み・正常稼働
- フロントエンド `public/feedback/` `public/feedback-admin/` が **git に一度も add されていない**
- 過去事故（2026-04-19 main.js 354 行ロスト未遂、2026-04-26 feedback.ts/trainingReport.ts ロスト）と **同じ「git に上げ忘れた」パターン** の再発

### Firebase Hosting リリース履歴 解析結果
| 日付 | 短縮 ID | ファイル数 | 推測 |
|---|---|---|---|
| 2026/04/06〜10 | 各種 | 48 | feedback 追加前 |
| 2026/04/14 14:10 | `d195bb` | 57 ↑ | feedback 系初追加（+9） |
| **2026/04/20 13:13** | **`4a986d`** | **61** ↑ | **feedback-admin も追加（ピーク） ← 復元元第一候補** |
| 2026/04/25 19:45 | `f42890` | 54 ↓ | **何か 7 ファイル削除（事故ポイント）** |
| 2026/04/26 22:50 | `34f494` | 57 | +3 復活（feedback だけ？） |
| 2026/04/27 〜 5/01 | 〜`5f6429` | 57 | feedback 系欠落のまま |

### Mac 側 Claude Code に渡す手順
**Step 1: Mac ローカル楽観チェック**
```bash
cd /Users/mewself/Desktop/village-tsubasa
ls public/ | grep -i feed
git status -s public/
```

**Step 2 (Mac に残ってた場合): そのまま git に取り込む**
```bash
git add public/feedback/ public/feedback-admin/
git commit -m "fix(public): 失われていた feedback / feedback-admin を Mac ローカルから救出して git に追加"
git push
firebase deploy --only hosting:village-tsubasa
```

**Step 3 (Mac にも無かった場合): Firebase Hosting 過去版を preview channel に複製**
```bash
firebase hosting:clone village-tsubasa:4a986d village-tsubasa:preview-feedback-recover --expires 1d
```
→ preview URL から DevTools で feedback/ feedback-admin/ のファイル取得 → git に commit → deploy

⚠️ **絶対に本番 rollback はしない**（5/2 デプロイ済みの複数ヘルパー個別ブロック表示等、最近の機能が巻き戻る）

### 完了判定
- [ ] `https://village-tsubasa.web.app/feedback/` が 200 で開く
- [ ] `https://village-tsubasa.web.app/feedback-admin/` が 200 で開く
- [ ] `git ls-files public/feedback/` でファイルが列挙される
- [ ] `scripts/check-menu-links.sh` 新規作成（メニューリンク先の存在チェック）
- [ ] `bash scripts/check-menu-links.sh` が exit 0
- [ ] `CHANGELOG.md` 追記
- [ ] `git push` 済み

---

## 🎯 直近やったこと（5/2）

- 居宅介護実績記録票 admin 機能 全部完成（HTML プレビュー / Excel 印刷用 / 重度訪問×30分以下警告 / 受給者番号バリデーション）
- J611 CSV 生成器を実装（`village-admin/functions/src/dashboard/csv-records-home.ts`）
- HiMacroEx 半自動入力ツールキット作成（`village-tsubasa/tools/jissystem-input/`）
- 「今日の予定」に合同ヘルパー表示を追加（`functions/src/todaySchedule.ts` + `public/today-schedule/main.js`）
- 本番デプロイ済み

---

## 🟢 進行中 / 次にやること

### すぐやれる（残タスク）
- [ ] 本番（admin / 今日の予定）で合同表記が反映されているか確認 — 通常ブラウザでも `Cmd+Shift+R` で確認
- [ ] スケジュール定期同期（GAS 時間トリガを 15〜30 分おきに設定 → 案 A）

### 中期（Windows 環境必要）
- [ ] HiMacroEx Phase 1: 簡易入力ソフトを手動 1 件入力 → ショートカット経路発見
- [ ] HiMacroEx 6 ファイル録画（01_select_user.hmx 〜 06_save.hmx）
- [ ] Excel に VBA import + ProcessOne でテスト

### 後日（CSV 完成）
- [ ] 通院サブタイプ分岐（113000 / 114000 / 115000）対応 — DB に subtype 列か運用ルール統一
- [ ] 提供通番の連続集約（2 時間以内同一番号）
- [ ] 0 時跨ぎシフトの簡易入力ソフト挙動確認
- [ ] 単位数マスタ + J121 明細書 + J111 請求書 で完全自動化

---

## 🟡 進行中: ヘルパーセルフマッチング Phase 1A（apply 待ち）

### 状態
- DDL 実行済み（commit `f4a14e9`）: `user_helper_compatibility` テーブル + `helper_master` 資格列追加
- GAS スクリプト書き込み済み（commit `b38eddc` まで）
- **dry-run 完了**（2026-04-30 10:03 JST）:
  - 61 ヘルパー列 / 28 helper_master と一致 / **33 未マッチ** / 168 利用者 / 4704 セル
  - **不明な値 1910 個**（先頭サンプル: ＮＧ全角, ✖全角）

### 残タスク
- **A**: `gas/village-schedule-sync/対応可否シート移行.gs:284` の `normalizeStatus_()` に `ＮＧ` (全角 NG) → `N`、`✖` (全角 X) → `×` を追加
- **B**: 未マッチ 33 ヘルパー（木野遙仁, 岩瀬, 足立, 岩﨑 ...）を helper_master と整合（奥原さん作業）
- **C**: A, B 完了後 `migrateCompatibilityApply()` で本番投入
- **D**: `installWeeklyCompatibilityTrigger()` で月曜 03:00 JST 週次同期登録

---

## ⚠️ 既知の注意

- **village-tsubasa 本体**: 一部ファイル（`feedback.ts` `trainingReport.ts`）が main repo にあるが worktree には無い → emulator は **必ず main repo (`~/village-tsubasa/`) から起動**
- **SUPABASE_SERVICE_ROLE_KEY**: anon ↔ service_role を間違える事故が定期的に起きる。新しい環境にセットする時は **JWT decode で `role: service_role` を確認**
- **GAS 同期**: `replaceAllCalendarSheetsToSupabase` は手動。自動同期未設定。スプレッドシート編集後は GAS から実行が必要
- **本番 Firebase Hosting への直接 rollback は禁止**: 最近の deploy（複数ヘルパー個別ブロック表示等）が巻き戻るので preview channel 経由で復元すること

---

## 🛡 推奨: 早めに作りたい再発防止系

1. **`scripts/check-menu-links.sh`** — `public/index.html` の `<a href="/xxx/">` 全てに対して `public/xxx/index.html` の存在を deploy 前にチェック（feedback 救出と同時に作りたい）
2. **`scripts/check-functions-imports.sh`** — `functions/src/index.ts` の `import` 文に対してソースファイルが git に存在することをチェック（4/19 main.js / 4/26 feedback.ts と同型事故防止）
3. **deploy ラッパー** — `scripts/safe-deploy.sh` で上記を全部走らせてから `firebase deploy`

---

## 📋 各システムの本番 URL（手元で確認用）

- ヘルパーアプリ: https://village-tsubasa.web.app/
- 今日の予定（自分用）: https://village-tsubasa.web.app/today-schedule/?helper_email=YOUR_EMAIL
- admin: https://village-admin-bd316.web.app/
- 居宅介護実績記録票: https://village-admin-bd316.web.app/records-home.html
- 利用者アプリ: GitHub Pages（user-schedule-app）

---

## 🔄 スマホで続きをやる時の流れ

1. **スマホで GitHub アプリを開く** → `village-tsubasa` リポジトリ
2. **`docs/SESSION_NOTES.md`** を開く（このファイル）
3. 内容をコピー
4. **Claude.ai アプリ**（モバイル版）で新しいチャットを開く
5. ペーストして「ここから続きをやりたい、〇〇について相談したい」と書く

→ Claude.ai は claude.ai のチャット用プロダクト。コード実行はできないが、**設計・調査・文章作成・計画**は OK。
→ コード実行が必要になったら「PC 戻ったら実装する」とメモして PC で再開。

---

## ✏️ このメモの更新ルール

- PC で大きい区切りごとに更新（朝・昼・夕・寝る前）
- git commit + push してスマホからも GitHub で見れるように
- CHANGELOG に書き写したらこのメモはクリアして次のテーマに

---

## 🔗 共有資料リンク

- ルール: `docs/RULES.md`
- 全体像: `docs/CURRENT_STATE.md`
- スキーマ: `docs/SUPABASE_SCHEMA.md`
- 履歴: `docs/CHANGELOG.md`
- アイデア: `docs/FUTURE_IDEAS.md`
- 健康診断スクリプト: `scripts/repo-health-check.sh`
