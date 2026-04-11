# クイックスタートガイド

## 1分でスタート

### インストール
```bash
# 依存パッケージをインストール
pip install -r requirements.txt
```

### 実行
```bash
# Streamlitアプリを起動
streamlit run app.py
```

ブラウザで自動的に http://localhost:8501 が開きます。

## 最初の操作

### ステップ1: レシートを登録
1. サイドバーで「📝 レシート登録」を選択
2. レシート画像をアップロード
3. OCR自動抽出された情報を確認
4. 「レシート登録」ボタンで保存

### ステップ2: レシートを検索
1. 「🔍 検索・一覧」を選択
2. 検索条件を指定（日付・金額など）
3. 結果を確認

### ステップ3: 詳細を編集
1. 「📋 詳細・編集」を選択
2. レシートを選択
3. 情報を編集して変更理由を記入
4. 保存

### ステップ4: 監査ログを確認
1. 「📊 監査ログ」を選択
2. 全ての変更履歴を確認

## 主な特徴

✅ **電子帳簿保存法対応**
- DPI200dpi以上の画像をチェック
- カラー画像（RGB）のみ受け入れ
- SHA-256ハッシュ値で原本性確保

✅ **自動OCR抽出**
- 日付、金額、店舗名を自動認識
- モック（デモ）OCRで即座にテスト可能

✅ **監査証跡**
- 全操作が自動記録
- 変更前後の値を保存
- 変更者と理由を記録

✅ **論理削除**
- 完全削除は不可（法的保護）
- 削除理由を記録

## ファイル構成

```
receipt_app/
├── app.py              # メインアプリ（4ページ構成）
├── database.py         # SQLite操作
├── image_utils.py      # 画像検証
├── ocr_utils.py        # OCR処理
├── requirements.txt    # 依存パッケージ
├── README.md           # 詳細ドキュメント
├── QUICK_START.md      # このファイル
├── receipt_database.db # データベース（自動生成）
└── images/             # 画像保存フォルダ（自動生成）
```

## よくある質問

**Q: OCRがうまく抽出できない**
A: デフォルトはモック（デモ）OCRです。正確なOCRが必要な場合は、Google Cloud Vision APIを設定してください。

**Q: データベースをリセットしたい**
A: `receipt_database.db` ファイルを削除して、アプリを再起動してください。

**Q: 削除したレシートを復元できない？**
A: 論理削除なので、管理者がデータベースを直接操作すれば復元可能です。

## トラブルシューティング

### エラー: `ModuleNotFoundError: No module named 'streamlit'`
```bash
pip install -r requirements.txt
```

### エラー: `permission denied` で画像保存できない
フォルダのパーミッションを確認：
```bash
chmod 755 .
```

### データベースが壊れた
```bash
rm receipt_database.db
streamlit run app.py
```

---

詳細は `README.md` を参照してください。
