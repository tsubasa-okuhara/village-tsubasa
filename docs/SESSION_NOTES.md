# SESSION_NOTES — 作業の引き継ぎメモ

> **目的**: PC ↔ スマホ間 / チャット間で「いま何やってる」を見失わないためのメモ。
> CHANGELOG と違って、過去の記録ではなく **進行中の状態** を書く。
> 一段落したら CHANGELOG に正式に書き写して、ここはクリア / 次のテーマに更新。

最終更新: 2026-05-03 09:00（feedback フロント救出完了、次は再発防止スクリプト）

---

## 🟡 次のタスク: 同型事故の再発防止スクリプトを実装

### 背景
2026-05-03 に「声のポスト」を救出した経験から、**「git に上げ忘れたまま deploy」** が複数回発生していることが判明（4/19 main.js, 4/26 feedback.ts/trainingReport.ts, 5/3 feedback フロント）。

### 実装したいガード
1. `scripts/check-menu-links.sh` — `public/index.html` の `<a href="/xxx/">` 全てに対して `public/xxx/index.html` の存在を deploy 前にチェック
2. `scripts/check-functions-imports.sh` — `functions/src/index.ts` の `import` 文に対してソースファイルが git に存在することをチェック
3. `scripts/safe-deploy.sh` — 上記を全部走らせてから `firebase deploy` を呼ぶラッパー

### 実装イメージ
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
missing=0
grep -oE 'href="/[a-zA-Z0-9_-]+/"' public/index.html | sort -u | while read -r m; do
  path=$(echo "$m" | sed 's|href="/|public/|;s|/"$||')
  if [ ! -f "$path/index.html" ]; then
    echo "❌ MISSING: $path/index.html"
    missing=$((missing+1))
  fi
done
[ "$missing" -gt 0 ] && exit 1 || exit 0
```

優先度: 中（次回チャット冒頭で着手すれば 30 分で完了）

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
