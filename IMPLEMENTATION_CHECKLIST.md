# 実装チェックリスト

## 必須ファイル

- [x] `app.py` - メインStreamlitアプリケーション
- [x] `database.py` - SQLiteデータベース操作層
- [x] `image_utils.py` - 画像検証・処理モジュール
- [x] `ocr_utils.py` - OCR抽出・テキスト解析モジュール
- [x] `requirements.txt` - 依存パッケージ一覧
- [x] `README.md` - 詳細ドキュメント
- [x] `QUICK_START.md` - クイックスタートガイド

## app.py - メインアプリケーション

### ページ1: レシート登録
- [x] ファイルアップロード機能
- [x] ドラッグ&ドロップ対応
- [x] 画像プレビュー表示
- [x] 画像検証（DPI、色モード）
- [x] OCR自動抽出
- [x] 抽出結果の表示
- [x] フォーム自動入力
- [x] 登録フォーム
  - [x] 取引年月日（日付ピッカー）
  - [x] 金額（数値入力）
  - [x] 取引先（オートコンプリート対応セレクトボックス）
  - [x] 費目（ドロップダウン）
  - [x] 備考（テキストエリア）
- [x] バリデーション
- [x] DB登録処理
- [x] 成功メッセージ表示

### ページ2: 検索・一覧
- [x] 検索条件パネル
  - [x] 取引年月日範囲
  - [x] 金額範囲
  - [x] 取引先検索
- [x] 検索実行ボタン
- [x] 統計情報表示（件数、合計、平均）
- [x] 結果テーブル表示
  - [x] ID、日付、金額、取引先、費目、登録日
  - [x] 通貨フォーマット
- [x] 詳細選択機能

### ページ3: 詳細・編集
- [x] レシート選択セレクトボックス
- [x] 画像大表示
- [x] 登録情報の表示
- [x] OCRテキスト表示（オプション）
- [x] 編集フォーム
  - [x] 全フィールド編集可能
  - [x] 変更理由（必須）
- [x] 更新処理
- [x] 論理削除機能
  - [x] 削除理由（必須）
- [x] 監査ログ表示

### ページ4: 監査ログ
- [x] ログ一覧表示
- [x] レシートIDでフィルタ
- [x] 操作タイプでフィルタ（INSERT/UPDATE/DELETE）
- [x] 全フィールド表示
  - [x] 日時、対象ID、操作、項目、変更前、変更後、変更者、理由

### UI/UX
- [x] 日本語UI
- [x] サイドバーナビゲーション
- [x] 統計情報をサイドバーに表示
- [x] Emoji使用（見やすさ向上）
- [x] wide レイアウト
- [x] st.success/st.error/st.warning メッセージ
- [x] st.metric で統計表示
- [x] 適切なフォーム検証

## database.py - データベース層

### テーブル定義
- [x] receipts テーブル
  - [x] id (PRIMARY KEY)
  - [x] transaction_date
  - [x] amount
  - [x] vendor
  - [x] category
  - [x] description
  - [x] image_path
  - [x] image_hash (UNIQUE)
  - [x] image_dpi
  - [x] image_color_mode
  - [x] scan_date
  - [x] ocr_raw_text
  - [x] is_deleted (論理削除フラグ)
  - [x] created_at
  - [x] updated_at
  - [x] created_by

- [x] receipt_audit_log テーブル
  - [x] log_id (PRIMARY KEY)
  - [x] receipt_id (FOREIGN KEY)
  - [x] action (INSERT/UPDATE/DELETE)
  - [x] changed_column
  - [x] old_value
  - [x] new_value
  - [x] changed_at
  - [x] changed_by
  - [x] reason

- [x] categories テーブル
  - [x] id (PRIMARY KEY)
  - [x] name (UNIQUE)
  - [x] is_active
  - [x] created_at

### 関数実装
- [x] init_db() - テーブル作成
- [x] insert_receipt() - 新規登録（監査ログ自動記録）
- [x] update_receipt() - 編集（監査ログ自動記録）
- [x] soft_delete_receipt() - 論理削除（監査ログ自動記録）
- [x] search_receipts() - 検索機能
  - [x] 日付範囲
  - [x] 金額範囲
  - [x] 取引先部分一致
- [x] get_receipt_by_id() - ID検索
- [x] get_audit_log() - 監査ログ取得
- [x] get_categories() - カテゴリー取得
- [x] get_unique_vendors() - 取引先一覧取得
- [x] get_receipt_stats() - 統計情報取得

### デフォルトカテゴリー
- [x] 交通費
- [x] 接待交際費
- [x] 消耗品費
- [x] 通信費
- [x] 水道光熱費
- [x] 地代家賃
- [x] 雑費
- [x] その他

## image_utils.py - 画像検証

### 検証機能
- [x] validate_image() - 総合検証
  - [x] DPI検証（200dpi以上）
  - [x] 色モード検証（RGB/RGBA）
  - [x] ファイル形式検証（JPG/PNG）
  - [x] エラー/警告メッセージ生成

- [x] DPI推定ロジック
  - [x] EXIFデータから取得
  - [x] A6サイズ仮定で計算

- [x] compute_hash() - SHA-256ハッシュ計算
- [x] save_image() - 画像保存（YYYY/MM構造）
- [x] get_image_path() - パス取得
- [x] load_image_for_display() - 画像ロード

## ocr_utils.py - OCR処理

### テキスト抽出
- [x] extract_text_mock() - デモOCR
- [x] extract_text_google_vision() - Google Vision API対応
- [x] extract_text() - 抽出実行（モード切り替え可能）

### テキスト解析
- [x] parse_date() - 日付抽出
  - [x] YYYY年MM月DD日
  - [x] YYYY/MM/DD
  - [x] YYYY-MM-DD
  - [x] 令和X年MM月DD日
  - [x] R8.X.X形式

- [x] parse_amount() - 金額抽出
  - [x] 合計パターン
  - [x] TOTAL パターン
  - [x] 税込パターン
  - [x] ¥シンボルパターン

- [x] parse_vendor() - 店舗名抽出
  - [x] 最初の有効行を取得
  - [x] 日付・金額行をスキップ

- [x] extract_receipt_info() - 総合抽出

## 電子帳簿保存法への対応

### スキャナ保存要件
- [x] DPI 200dpi以上
- [x] カラー画像（RGB）
- [x] 画像形式チェック
- [x] 自動検証ロジック

### 電子データ保存要件
- [x] SHA-256ハッシュ値計算
- [x] タイムスタンプ記録
- [x] 画像DPI記録
- [x] 原本性確保

### 改ざん防止
- [x] 物理削除禁止（論理削除のみ）
- [x] 監査ログ必須記録
- [x] 変更前後の値記録
- [x] 変更者記録
- [x] 変更理由記録（必須）

## ドキュメント

- [x] README.md
  - [x] 機能説明
  - [x] セットアップ手順
  - [x] 使用方法
  - [x] ディレクトリ構造
  - [x] Google Vision API対応説明
  - [x] 法的対応説明
  - [x] トラブルシューティング
  - [x] 開発者向け情報

- [x] QUICK_START.md
  - [x] 1分インストール
  - [x] 基本的な使用方法
  - [x] 主な特徴
  - [x] ファイル構成
  - [x] FAQ

## 品質管理

- [x] Python構文チェック（コンパイル成功）
- [x] 日本語コメント記入
- [x] エラーハンドリング
- [x] バリデーション
- [x] 適切な例外処理

## 実行テスト項目

### 初期化
- [ ] `streamlit run app.py` で起動可能
- [ ] ブラウザで http://localhost:8501 にアクセス可能
- [ ] database.db が自動生成される
- [ ] images/ ディレクトリが自動作成される

### レシート登録テスト
- [ ] 画像アップロード可能
- [ ] DPI検証が動作
- [ ] 色モード検証が動作
- [ ] OCR抽出が動作
- [ ] レシート登録可能
- [ ] 監査ログに INSERT が記録される

### 検索テスト
- [ ] 日付範囲検索が動作
- [ ] 金額範囲検索が動作
- [ ] 取引先部分一致検索が動作
- [ ] 統計情報が計算される

### 編集テスト
- [ ] レシート選択可能
- [ ] 編集フォーム表示
- [ ] 変更理由必須チェック
- [ ] 更新処理が動作
- [ ] 監査ログに UPDATE が記録される

### 削除テスト
- [ ] 論理削除が動作
- [ ] 削除理由記録される
- [ ] 監査ログに DELETE が記録される
- [ ] 削除後もデータベースに記録（is_deleted=1）

### 監査ログテスト
- [ ] 全操作が表示される
- [ ] フィルタが動作する
- [ ] タイムスタンプが正確

---

## デプロイ準備

- [x] requirements.txt で全依存関係を記載
- [x] .gitignore を作成（推奨）
- [x] 本番環境での Google Vision API セットアップ手順を記載

---

**チェック日**: 2024年4月10日
**ステータス**: 完成
**テスト状況**: 実装完了、実行テスト待機中

