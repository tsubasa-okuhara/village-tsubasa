# 経費精算・レシート管理システム

電子帳簿保存法（スキャナ保存）対応の個人事業主向けレシート管理アプリ。
Streamlit + Supabase + Claude AI で動作。

## 主な機能

- 📝 **レシート登録**: スマホで撮った写真をアップロードし、Claude AI + EasyOCR で自動解析
- 🔍 **検索・一覧**: 日付・金額・取引先で横断検索
- 📊 **Excel エクスポート**: ヘルパーさん用の明細をボタンひとつで出力
- 📋 **編集・論理削除**: 変更は全て監査ログに記録（理由必須）
- 🔐 **監査ログ**: 全操作の履歴を保持、改ざん不可
- 📱 **スマホ対応**: どこからでもアクセス可能

## 電子帳簿保存法への対応

| 要件 | 実装 |
|------|------|
| 真実性の確保 | SHA-256 ハッシュ、監査ログ、物理削除禁止トリガー |
| 可視性の確保 | 日付・金額・取引先の3要素検索 |
| 見読性の確保 | 200dpi 以上のカラー画像のみ受け付け |
| タイムスタンプ | 登録時に自動付与 |

## 技術スタック

- **フロント**: Streamlit
- **DB**: Supabase (PostgreSQL) / ローカル時は SQLite
- **OCR**: EasyOCR (無料・無制限)
- **AI解析**: Claude Haiku API (claude-haiku-4-5)
- **画像処理**: OpenCV (自動クロップ・射影変換)

## ローカルで動かす

```bash
# 1. リポジトリをクローン
git clone https://github.com/YOUR_USERNAME/receipt-app.git
cd receipt-app

# 2. 依存ライブラリをインストール
pip install -r requirements.txt

# 3. (任意) Claude API キーを設定
export ANTHROPIC_API_KEY="sk-ant-..."

# 4. アプリを起動
streamlit run app.py
```

ブラウザで `http://localhost:8501` にアクセス。
初回パスワードは `changeme`（環境変数 `APP_PASSWORD` で上書き可）。

## 本番デプロイ

[DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。
Streamlit Cloud + Supabase での無料デプロイ手順をステップバイステップで記載しています。

## ファイル構成

```
receipt_app/
├── app.py                    # Streamlit メインアプリ
├── database.py               # SQLite / Supabase 両対応のDB層
├── image_utils.py            # 画像検証・自動クロップ
├── ocr_utils.py              # EasyOCR + Claude API
├── requirements.txt          # Python 依存ライブラリ
├── supabase_schema.sql       # Supabase 用 PostgreSQL スキーマ
├── .streamlit/
│   └── secrets.toml.example  # シークレット設定サンプル
├── .gitignore
├── README.md
└── DEPLOYMENT.md
```

## セキュリティ

- パスワード認証必須
- 画像・DBファイル・API キーは Git 管理外（.gitignore で除外）
- Supabase の物理削除は SQL トリガーで禁止
- 監査ログの UPDATE / DELETE も SQL トリガーで禁止

## ライセンス

個人用途のため未設定。
