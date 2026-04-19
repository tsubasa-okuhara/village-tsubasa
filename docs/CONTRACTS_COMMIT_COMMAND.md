# 契約機能コミット手順（奥原さんのローカル PC で実行）

Cowork サンドボックスの FUSE マウント制約で、このセッションからは `git commit` を完了できませんでした。
ただし **ステージ（`git add`）は成功している** ので、ローカルのターミナルで `.git/index.lock` を消してコミットするだけで済みます。

## 手順

```bash
# 1. village-tsubasa リポジトリに移動
cd ~/path/to/village-tsubasa

# 2. Cowork が残したロックファイルを削除
rm -f .git/index.lock

# 3. ステージ内容を確認（契約関連21ファイル・約3301行が見えるはず）
git diff --cached --stat

# 4. 問題なければコミット
git commit -m "$(cat <<'EOF'
feat: 電子契約機能 Phase 0〜4 雛形を追加

ハイブリッド構成（自社UI + 外部署名API）で電子契約機能を既存アプリに組み込む。
クラウドサイン API を第一候補として provider 抽象層を用意し、GMOサインは後追い可能に。

- Phase 0: docs/CONTRACTS_PHASE0.md（方針・API比較）
- Phase 1: docs/CONTRACTS_DESIGN.md（全体設計書）
- Phase 2: sql/create_contracts.sql（新規5テーブル）
- Phase 3: functions/src/contracts/（API 15本、送信・Webhook は 501 スタブ）
- Phase 4: public/contracts/（ヘルパー向け雇用契約タブ 雛形）
- docs/CHANGELOG.md と docs/CURRENT_STATE.md を更新（RULES ルール5）

既存テーブル・既存APIへの破壊的変更なし（RULES ルール2・3・4・6 準拠）。
EOF
)"

# 5. コミットできたらプッシュ（リモートに反映）
git push origin main
```

## もしステージが消えていたら

`git diff --cached --stat` に何も出ない場合、手動で再ステージできます:

```bash
# 契約関連の新規ファイルをまとめて追加
git add functions/src/contracts/ public/contracts/ \
  sql/create_contracts.sql \
  docs/CONTRACTS_PHASE0.md docs/CONTRACTS_DESIGN.md docs/CURRENT_STATE.md \
  docs/CHANGELOG.md

# index.ts は契約関連の5行だけ追加したい。Part staging が必要:
git add -p functions/src/index.ts
# → 4つの hunk が表示される。hunk 1 と hunk 3 のみ y、hunk 2 と hunk 4 は n
#   (training-reports/delete / helpers/lookup / training-materials の追加は別コミット推奨)

git status
git commit -m "(上と同じメッセージ)"
```

## 他のコミットしていない変更について

`git status` には他にも沢山の未コミット変更（削除された過去ファイル、経費精算 Streamlit 関連、
training-reports / training-materials 関連、公開 HTML の変更など）が残っています。
これらは今回の契約機能のコミットには **含めていません**。必要に応じて別のロジカルなコミットに
まとめて登録してください。
