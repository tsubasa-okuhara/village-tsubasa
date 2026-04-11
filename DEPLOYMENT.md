# デプロイ手順書

Streamlit Cloud + Supabase + GitHub で無料デプロイする手順。
かかる時間: 約 30 分。

## 全体の流れ

1. **GitHub** にリポジトリを作成してコードを push
2. **Supabase** にプロジェクトを作成してテーブルを作成
3. **Streamlit Cloud** でアプリをデプロイ
4. シークレット（パスワード・APIキー）を設定
5. スマホからアクセス確認

---

## ステップ1: GitHub にコードを push

### 1-1. GitHub で空のリポジトリを作成

1. https://github.com/new にアクセス
2. **Repository name**: `receipt-app`（好きな名前）
3. **Private** を選択（必ず Private にすること！パスワードをシークレットにしても念のため）
4. README、.gitignore、ライセンスのチェックは **全部オフ** のまま
5. 「Create repository」

### 1-2. ローカルから push

ターミナルで `receipt_app` フォルダに移動して:

```bash
cd ~/Desktop/receipt_app

# Git 初期化
git init
git branch -M main

# 全ファイルを追加（.gitignore で除外されるもの以外）
git add .

# 初回コミット
git commit -m "Initial commit"

# GitHub リモートを追加 (YOUR_USERNAME を書き換える)
git remote add origin https://github.com/YOUR_USERNAME/receipt-app.git

# push
git push -u origin main
```

GitHub の Web 画面をリロードして、ファイルが上がっていれば OK。

**⚠️ 注意**: `.streamlit/secrets.toml`、`*.db`、`images/` などが含まれていないか必ず確認してください。

---

## ステップ2: Supabase にデータベースを作る

### 2-1. アカウント作成

1. https://supabase.com にアクセス
2. 「Start your project」→ GitHub アカウントでサインアップ
3. 無料プランで十分です

### 2-2. プロジェクト作成

1. ダッシュボードで「New Project」
2. **Name**: `receipt-app`
3. **Database Password**: 強いパスワードを生成（どこかにメモ）
4. **Region**: `Northeast Asia (Tokyo)` を選択
5. 「Create new project」→ 2分ほど待機

### 2-3. テーブルを作成

1. 左サイドバーの「SQL Editor」をクリック
2. 「New query」
3. `supabase_schema.sql` の内容をすべてコピーして貼り付け
4. 右下の「Run」ボタン（または Cmd+Enter）
5. 「Success. No rows returned」が出れば OK

### 2-4. 接続情報を取得

1. 左サイドバーの「Project Settings」（歯車マーク）→「API」
2. 以下をメモ:
   - **Project URL** (例: `https://xxxxx.supabase.co`)
   - **service_role** キー（`anon` ではなく `service_role` の方！「Reveal」をクリック）

**⚠️ service_role キーは絶対に公開しないこと。GitHub に上げない、人に見せない。**

---

## ステップ3: Streamlit Cloud でデプロイ

### 3-1. アカウント作成

1. https://share.streamlit.io にアクセス
2. GitHub アカウントでサインイン
3. 「Authorize Streamlit」

### 3-2. アプリを作成

1. 「New app」をクリック
2. **Repository**: `tsubasa-okuhara/v-sche-app` を選択
3. **Branch**: `main`
4. **Main file path**: `receipt-app/app.py`  ← サブディレクトリの中なのでこのパス
5. **App URL**: 好きなサブドメイン（例: `ohara-receipt`）→ 全世界で一意な必要あり
6. 「Advanced settings」→「Python version」: 3.11 を選択（推奨）
7. 「Deploy!」をクリック

**⚠️ 注意**: `v-sche-app` リポジトリのルートには Node.js の `package.json` がありますが、
Streamlit Cloud は `Main file path` で指定したファイルと同じディレクトリの `requirements.txt` を
優先して読むので問題ありません（`receipt-app/requirements.txt` が使われる）。

初回は Pillow や EasyOCR のインストールで 5〜10 分かかります。

### 3-3. シークレット設定

デプロイが進んでいる間に:

1. アプリ画面の右下「Manage app」→「Settings」→「Secrets」
2. 以下を貼り付け（値は自分のに書き換え）:

```toml
[auth]
password = "あなたの強いパスワード"

[supabase]
url = "https://xxxxx.supabase.co"
key = "eyJhbGciOiJIUzI1NiIs..."  # service_role キー

[anthropic]
api_key = "sk-ant-..."
```

3. 「Save」→ アプリが自動的に再起動

---

## ステップ4: 動作確認

1. アプリ URL にアクセス（例: `https://ohara-receipt.streamlit.app`）
2. パスワードを入力
3. レシートを1枚アップロード
4. 正常に登録できれば成功 🎉
5. Supabase ダッシュボード →「Table Editor」→「receipts」で1行入っていることを確認

### スマホからアクセス

同じ URL をスマホのブラウザで開くだけ。
ホーム画面に追加しておくとアプリのように使えます。

---

## ステップ5: 今後の更新

コードを変更したら:

```bash
git add .
git commit -m "変更内容"
git push
```

Streamlit Cloud が自動検知して再デプロイします（1〜2分）。

---

## トラブルシューティング

### Q. デプロイ時に「ModuleNotFoundError」

`requirements.txt` に必要なパッケージがあるか確認。
特に `opencv-python-headless`（`opencv-python` ではダメ）。

### Q. ログイン後「Supabase接続エラー」

- service_role キーが正しいか確認（anon キーになっていないか）
- Supabase プロジェクトが Pause されていないか確認（無料プランは1週間アクセスなしで Pause）

### Q. OCR がタイムアウトする

Streamlit Cloud の無料プランはメモリが1GBです。
EasyOCR 初回起動時はモデルダウンロードに時間がかかります。
2回目以降は高速です。

### Q. パスワードを忘れた

Streamlit Cloud の Secrets 画面で `[auth] password` を変更して保存。

### Q. Supabase が重くなった

無料プランは DB 容量 500MB、帯域 5GB/月。
個人利用なら数年は持ちます。超過したらスタータープラン $25/月。

---

## コスト見積もり

| サービス | プラン | 月額 |
|----------|--------|------|
| Streamlit Cloud | Free | 0円 |
| Supabase | Free | 0円 |
| GitHub | Free (Private OK) | 0円 |
| Claude API | 従量課金 | レシート100枚で約 20円 |

**合計: 月 20円程度** でスマホから使える SaaS が完成します。
