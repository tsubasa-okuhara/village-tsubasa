# SESSION_NOTES — 作業の引き継ぎメモ

> **目的**: PC ↔ スマホ間で「いま何やってる」を見失わないためのメモ。
> CHANGELOG と違って、過去の記録ではなく **進行中の状態** を書く。
> 一段落したら CHANGELOG に正式に書き写して、ここはクリア / 次のテーマに更新。

最終更新: 2026-05-02 22:50

---

## 🎯 直近やったこと（今日）

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

## ⚠️ 既知の注意

- **village-tsubasa 本体**: 一部ファイル（`feedback.ts` `trainingReport.ts`）が main repo にあるが worktree には無い → emulator は **必ず main repo (`~/village-tsubasa/`) から起動**
- **SUPABASE_SERVICE_ROLE_KEY**: anon ↔ service_role を間違える事故が定期的に起きる。新しい環境にセットする時は **JWT decode で `role: service_role` を確認**
- **GAS 同期**: `replaceAllCalendarSheetsToSupabase` は手動。自動同期未設定。スプレッドシート編集後は GAS から実行が必要

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
