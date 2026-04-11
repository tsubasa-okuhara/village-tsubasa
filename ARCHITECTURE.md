# システムアーキテクチャ概要

## 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                  Streamlit Web UI (app.py)              │
│  ┌──────────────┬──────────────┬──────────────┬─────┐  │
│  │ Page1: 登録   │ Page2: 検索   │ Page3: 編集   │ Page4 │  │
│  │ Registration │ Search       │ Edit         │ Logs  │  │
│  └──────────────┴──────────────┴──────────────┴─────┘  │
└─────────────────┬────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────────┐
        │                    │              │
    ┌───────────────┐  ┌──────────────┐  ┌─────────────┐
    │  database.py  │  │image_utils.py│  │ocr_utils.py │
    │  (SQLite)     │  │ (検証・保存)   │  │(OCR処理)    │
    └───┬───────────┘  └──────┬───────┘  └──────┬──────┘
        │                     │               │
        │          ┌──────────┴────────────┐  │
        │          │                       │  │
    ┌───────────────────┐  ┌──────────────────┐
    │ receipt_db.db     │  │ images/          │
    │ ├─ receipts       │  │ ├─ 2024/         │
    │ ├─ audit_log      │  │ │  ├─ 03/        │
    │ └─ categories     │  │ │  └─ 04/        │
    └───────────────────┘  └──────────────────┘
```

## モジュール設計

### 1. app.py - メインアプリケーション (22KB)

**責務**: ユーザーインターフェース・ビジネスロジック統合

**主要機能**:
- Streamlitページ管理（4ページ）
- フォーム入力・バリデーション
- データ表示・検索結果表示
- ユーザー操作の制御フロー

**構成要素**:
```
app.py
├── page_receipt_registration()  # 登録ページ
│   ├── 画像アップロード処理
│   ├── 画像検証表示
│   ├── OCR抽出実行
│   └── フォーム入力・登録
├── page_search_and_list()       # 検索ページ
│   ├── 検索条件入力
│   ├── 検索実行
│   └── 結果表示・統計
├── page_detail_and_edit()       # 詳細編集ページ
│   ├── レシート選択
│   ├── 画像表示
│   ├── 編集フォーム
│   └── 削除機能
├── page_audit_log()             # 監査ログページ
│   ├── ログ表示
│   └── フィルタリング
└── main()                        # エントリーポイント
```

**外部依存**:
- streamlit (UI)
- pandas (データ処理)
- datetime (日時処理)
- database, image_utils, ocr_utils (自作モジュール)

### 2. database.py - データベース層 (13KB)

**責務**: SQLiteデータベースの操作・管理

**設計原則**:
- ACID特性の確保
- 監査ログの自動記録
- 論理削除による改ざん防止

**テーブル設計**:

```sql
-- メインテーブル
receipts (id, transaction_date, amount, vendor, category, 
         description, image_path, image_hash, image_dpi, 
         image_color_mode, scan_date, ocr_raw_text, 
         is_deleted, created_at, updated_at, created_by)

-- 監査証跡
receipt_audit_log (log_id, receipt_id, action, changed_column, 
                   old_value, new_value, changed_at, 
                   changed_by, reason)

-- マスターデータ
categories (id, name, is_active, created_at)
```

**関数インターフェース**:
```python
init_db()                          # 初期化
insert_receipt(...)                # 登録（→ INSERT監査ログ）
update_receipt(...)                # 更新（→ UPDATE監査ログ）
soft_delete_receipt(...)           # 削除（→ DELETE監査ログ）
search_receipts(date_from, ...)    # 検索
get_receipt_by_id(receipt_id)      # ID検索
get_audit_log(receipt_id)          # 監査ログ取得
get_categories()                   # カテゴリー取得
get_unique_vendors()               # 取引先一覧
get_receipt_stats(...)             # 統計計算
```

**監査ログ自動記録メカニズム**:
```
insert_receipt()
  ├── INSERT INTO receipts ...
  ├── INSERT INTO receipt_audit_log (action='INSERT')
  └── COMMIT

update_receipt()
  ├── SELECT * FROM receipts WHERE id=?  # 現在の値
  ├── UPDATE receipts SET ...
  ├── FOR EACH changed_column:
  │   INSERT INTO receipt_audit_log 
  │     (action='UPDATE', old_value, new_value, reason)
  └── COMMIT

soft_delete_receipt()
  ├── UPDATE receipts SET is_deleted=1
  ├── INSERT INTO receipt_audit_log (action='DELETE', reason)
  └── COMMIT
```

### 3. image_utils.py - 画像検証・処理 (5.7KB)

**責務**: 電子帳簿保存法の画像要件チェック

**検証ロジック**:
```
validate_image()
├── DPI検証
│   ├── EXIFメタデータから取得
│   └── なければ寸法から推定 (A6サイズ想定)
├── 色モード検証 (RGB/RGBA必須)
├── ファイル形式検証 (JPG/PNG)
└── 詳細エラー/警告メッセージ生成
```

**DPI推定アルゴリズム**:
```
受領書をA6サイズ (105×148mm) と仮定

DPI = (ピクセル幅 / 105mm) × 25.4 (mm/inch)

例: 1240×1754px
  → DPI = ((1240/105) × 25.4) = 299 dpi
```

**関数**:
```python
validate_image(uploaded_file)  # 総合検証 → {is_valid, dpi, ...}
compute_hash(image_bytes)      # SHA-256ハッシュ値
save_image(image_bytes, id)    # 画像保存 (images/YYYY/MM/)
load_image_for_display(path)   # 表示用画像ロード
```

### 4. ocr_utils.py - OCR抽出・テキスト解析 (7.5KB)

**責務**: 画像からのテキスト抽出と情報パース

**2つのOCRモード**:

```
モード1: モック（デモ）
  extract_text_mock(image)
  → サンプルレシートテキストを返す
  → 即座にテスト可能、外部サービス不要

モード2: Google Cloud Vision API
  extract_text_google_vision(image_bytes)
  → 高精度なOCR
  → 認証情報が必要
```

**テキスト解析エンジン**:
```python
extract_receipt_info(ocr_text)
├── parse_date(text)      # 日付抽出
│   ├── 2024年3月15日
│   ├── 2024/03/15
│   ├── 2024-03-15
│   ├── 令和6年3月15日
│   └── R6.3.15
├── parse_amount(text)     # 金額抽出
│   ├── 合計 ¥2,893
│   ├── TOTAL ¥2,893
│   ├── 税込 ¥2,893
│   └── ¥ を含む最後の数字
└── parse_vendor(text)     # 店舗名抽出
    └── 最初の有効行を取得

→ {date, amount, vendor, raw_text}
```

## データフロー

### レシート登録フロー

```
ユーザー入力
    ↓
[app.py] アップロード
    ↓
[image_utils.py] validate_image()
    ├─ DPI検証 ✓/✗
    ├─ 色モード検証 ✓/✗
    └─ ハッシュ計算
    ↓
[ocr_utils.py] extract_text() + parse_info()
    ├─ テキスト抽出
    └─ 日付/金額/店舗抽出
    ↓
[app.py] フォーム自動入力・ユーザー確認
    ↓
[image_utils.py] save_image()
    └─ images/YYYY/MM/receipt_*.jpg に保存
    ↓
[database.py] insert_receipt()
    ├─ receipts テーブルに INSERT
    ├─ image_hash を UNIQUE チェック
    └─ receipt_audit_log に INSERT (action='INSERT') 自動記録
    ↓
✅ 登録完了
```

### レシート更新フロー

```
ユーザー編集
    ↓
[app.py] 編集フォーム入力
    ├─ 変更理由入力（必須）
    └─ 「変更を保存」クリック
    ↓
[database.py] update_receipt()
    ├─ 現在の値を SELECT
    ├─ 変更があったカラムのみ比較
    ├─ UPDATE receipts SET ...
    └─ FOR EACH 変更:
        INSERT INTO receipt_audit_log
          (action='UPDATE', changed_column, old_value, 
           new_value, reason, changed_by)
    ↓
✅ 更新完了（変更前後がログに記録）
```

### レシート削除フロー（論理削除）

```
ユーザー削除要求
    ↓
[app.py] 削除確認
    └─ 削除理由入力（必須）
    ↓
[database.py] soft_delete_receipt()
    ├─ UPDATE receipts SET is_deleted=1
    └─ INSERT INTO receipt_audit_log
        (action='DELETE', reason)
    ↓
[database.py] 検索時の自動フィルタ
    └─ WHERE is_deleted=0
    ↓
✅ 削除完了（物理削除なし）
```

## 電子帳簿保存法への対応マッピング

| 要件 | 実装箇所 | 方法 |
|------|---------|------|
| DPI 200dpi以上 | image_utils.py | validate_image()で自動チェック |
| カラー画像 | image_utils.py | RGB/RGBA必須チェック |
| ハッシュ値 | image_utils.py | SHA-256計算 + UNIQUE制約 |
| タイムスタンプ | database.py | scan_date, created_at, updated_at |
| 改ざん防止 | database.py | 論理削除のみ + 監査ログ |
| 変更履歴 | database.py | receipt_audit_log テーブル |
| 変更前後の値 | database.py | old_value, new_value 記録 |
| 変更者記録 | database.py | changed_by フィールド |
| 変更理由記録 | database.py | reason フィールド（必須） |

## セキュリティ設計

### 1. データ整合性

```
物理削除禁止
├─ is_deleted フラグで論理削除
├─ 検索時に自動フィルタ
└─ 履歴は永遠に残る

ハッシュ値による改ざん検知
├─ SHA-256で画像を検証
├─ 重複アップロード防止（UNIQUE制約）
└─ 画像の原本性確保
```

### 2. 監査証跡

```
全操作が自動記録
├─ INSERT: レシート登録時
├─ UPDATE: フィールド変更時（変更前後の値）
└─ DELETE: 論理削除時

メタデータ記録
├─ 操作日時（changed_at）
├─ 操作者（changed_by）
└─ 操作理由（reason）
```

### 3. アクセス制御

```
本実装: ユーザー情報は changed_by フィールドに記録
（本番環境では Streamlit認証機能を統合可能）

運用方針:
├─ created_by: 登録者ID
├─ changed_by: 変更者ID
└─ deleted_by: 削除者ID
```

## パフォーマンス考慮

### インデックス戦略（推奨）

```sql
-- 検索パフォーマンス向上
CREATE INDEX idx_receipts_transaction_date 
  ON receipts(transaction_date);

CREATE INDEX idx_receipts_vendor 
  ON receipts(vendor);

CREATE INDEX idx_audit_receipt_id 
  ON receipt_audit_log(receipt_id);

-- 論理削除フィルタ最適化
CREATE INDEX idx_receipts_is_deleted 
  ON receipts(is_deleted);
```

### 画像保存最適化

```
YYYY/MM/ フォルダ構造
├─ ディレクトリが分散（同一フォルダへの集中を回避）
├─ タイムスタンプ付きファイル名（一意性保証）
└─ 相対パスで管理（ポータビリティ確保）

例: images/2024/03/receipt_5_20240315_142312.jpg
```

## 拡張ポイント

### 1. Google Vision API統合

```python
# ocr_utils.py で既に実装済み
extract_text_google_vision(image_bytes)

# 本番環境での有効化:
# 1. Google Cloud Console で Vision API有効化
# 2. サービスアカウント JSON取得
# 3. GOOGLE_APPLICATION_CREDENTIALS 環境変数設定
# 4. pip install google-cloud-vision
# 5. app.py で use_mock=False に変更
```

### 2. ユーザー認証

```python
# Streamlit Auth0/Azure AD 連携
# app.py の created_by="user" を動的化

import streamlit as st
if not st.session_state.get("authenticated"):
    # ログイン処理
else:
    created_by = st.session_state.user_id
```

### 3. 複数ユーザー対応

```python
# database.py に user テーブル追加
# receipts.created_by, updated_by を外部キー化
# 監査ログにユーザー情報の詳細を追加
```

### 4. クラウドストレージ連携

```python
# image_utils.py で save_image() をカスタマイズ
# Azure Blob Storage / AWS S3 / Google Cloud Storage へ保存

def save_image(image_bytes, receipt_id):
    # ローカル + クラウド両方に保存
    # バックアップ・レプリケーション対応
```

### 5. レポート機能

```python
# app.py に Page5: レポート を追加
# 期間別集計、カテゴリー別分析、
# 月次/年次レポート出力
```

---

**最終更新**: 2024年4月10日
**バージョン**: 1.0.0
**準拠**: 電子帳簿保存法（令和5年改正対応）

