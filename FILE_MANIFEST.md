# ファイルマニフェスト

## プロジェクトファイル一覧

```
receipt_app/
├── Core Application Files
│   ├── app.py                          (22 KB) メインStreamlitアプリ - 4ページUI
│   ├── database.py                     (13 KB) SQLiteデータベース層
│   ├── image_utils.py                  (5.7 KB) 画像検証・処理
│   └── ocr_utils.py                    (7.5 KB) OCR抽出・テキスト解析
│
├── Configuration & Dependencies
│   ├── requirements.txt                (64 B)  依存パッケージ一覧
│   └── .streamlit_config_example       (388 B) Streamlit設定テンプレート
│
├── Documentation
│   ├── README.md                       (7.3 KB) 詳細ドキュメント
│   ├── QUICK_START.md                  (3.0 KB) クイックスタートガイド
│   ├── ARCHITECTURE.md                 (9.8 KB) システムアーキテクチャ
│   ├── IMPLEMENTATION_CHECKLIST.md     (7.8 KB) 実装チェックリスト
│   └── FILE_MANIFEST.md                (このファイル)
│
├── Auto-Generated (Runtime)
│   ├── receipt_database.db             SQLiteデータベース（初回実行時生成）
│   ├── images/                         スキャン画像格納フォルダ（YYYY/MM構造）
│   │   ├── 2024/
│   │   │   ├── 03/
│   │   │   │   └── receipt_*.jpg
│   │   │   └── 04/
│   │   │       └── receipt_*.jpg
│   │   └── ...
│   └── __pycache__/                    Pythonコンパイル済みファイル
│
└── .gitignore (推奨)
    # 以下をgitignore対象に
    receipt_database.db
    images/
    __pycache__/
    *.pyc
    .streamlit/secrets.toml
```

## ファイル詳細説明

### 1. app.py (メインアプリケーション)

**行数**: 約700行  
**責務**: Streamlit UIとビジネスロジック統合  
**構成**:
- ページ1: 📝 レシート登録 (receipt_registration)
- ページ2: 🔍 検索・一覧 (search_and_list)
- ページ3: 📋 詳細・編集 (detail_and_edit)
- ページ4: 📊 監査ログ (audit_log)

**主な機能**:
```python
- 画像アップロード + プレビュー
- 検証結果の視覚化（✅/❌）
- OCR抽出結果の表示
- フォーム自動入力
- テーブル検索結果表示
- 編集・削除処理
- 監査ログフィルタリング
```

### 2. database.py (SQLiteデータベース層)

**行数**: 約400行  
**責務**: データベース操作・監査ログ管理  
**テーブル定義**: 3テーブル
```
receipts (メインテーブル)
├─ id, transaction_date, amount, vendor, category
├─ description, image_path, image_hash
├─ image_dpi, image_color_mode, scan_date
├─ ocr_raw_text, is_deleted
└─ created_at, updated_at, created_by

receipt_audit_log (監査証跡)
├─ log_id, receipt_id, action
├─ changed_column, old_value, new_value
└─ changed_at, changed_by, reason

categories (マスターデータ)
├─ id, name, is_active
└─ created_at
```

**関数**: 12個
```
CRUD操作:
- init_db()                     テーブル初期化
- insert_receipt()             新規登録（監査ログ自動）
- update_receipt()             編集（監査ログ自動）
- soft_delete_receipt()        論理削除（監査ログ自動）

検索機能:
- search_receipts()            複合条件検索
- get_receipt_by_id()          ID検索

情報取得:
- get_audit_log()              監査ログ取得
- get_categories()             カテゴリー取得
- get_unique_vendors()         取引先一覧取得
- get_receipt_stats()          統計計算
```

### 3. image_utils.py (画像検証・処理)

**行数**: 約250行  
**責務**: 電子帳簿保存法の画像要件チェック  
**検証項目**:
```
✓ DPI検証 (≥200dpi)
  - EXIFメタデータから取得
  - 無い場合はA6サイズから推定
✓ 色モード検証 (RGB/RGBA必須)
✓ ファイル形式検証 (JPG/PNG)
✓ ハッシュ値計算 (SHA-256)
```

**関数**: 6個
```
validate_image()           総合検証
get_dpi_from_dimensions()  DPI推定
compute_hash()             SHA-256ハッシュ計算
save_image()               画像保存（YYYY/MM/構造）
get_image_path()           パス取得
load_image_for_display()   表示用ロード
```

### 4. ocr_utils.py (OCR処理)

**行数**: 約300行  
**責務**: テキスト抽出と情報パース  
**2つのOCRモード**:
```
モード1: モック（デモ用）
- 即座にテスト可能
- 外部サービス不要

モード2: Google Vision API
- 高精度なOCR
- 認証情報が必要
```

**抽出対象**:
```
parse_date()   - 日付
  ├─ 2024年3月15日
  ├─ 2024/03/15
  ├─ 2024-03-15
  ├─ 令和6年3月15日
  └─ R6.3.15

parse_amount() - 金額
  ├─ 合計 ¥2,893
  ├─ TOTAL ¥2,893
  ├─ 税込 ¥2,893
  └─ ¥xxx (最後の金額)

parse_vendor() - 店舗名
  └─ 最初の有効行を取得
```

### 5. requirements.txt (依存パッケージ)

```
streamlit>=1.30
Pillow>=10.0
pandas>=2.0
python-dateutil>=2.8.2
```

**オプション** (Google Vision API使用時):
```
google-cloud-vision>=3.0.0
```

### 6. README.md (詳細ドキュメント)

**セクション**:
- 機能説明
- セットアップ手順
- 使用方法（4ページ別）
- ディレクトリ構造
- Google Vision API対応
- 電子帳簿保存法への対応
- トラブルシューティング
- 開発者向け情報

**対象読者**: エンドユーザー、管理者、開発者

### 7. QUICK_START.md (クイックスタート)

**内容**:
- 1分インストール
- 最初の操作ステップ
- 主な特徴
- ファイル構成
- よくある質問
- トラブルシューティング

**対象読者**: 初めて使用するユーザー

### 8. ARCHITECTURE.md (システム設計)

**セクション**:
- 全体構成図
- モジュール設計詳細
- データフロー
- 電子帳簿保存法との対応マッピング
- セキュリティ設計
- パフォーマンス考慮
- 拡張ポイント

**対象読者**: 開発者、アーキテクト

### 9. IMPLEMENTATION_CHECKLIST.md (実装確認)

**確認項目**:
- 必須ファイル（7個）
- app.py実装確認（全機能）
- database.py実装確認（全テーブル・関数）
- image_utils.py実装確認
- ocr_utils.py実装確認
- 電子帳簿保存法対応
- ドキュメント完備
- 品質管理
- 実行テストリスト

**用途**: 開発完了確認、品質保証

### 10. .streamlit_config_example

**Streamlit設定テンプレート**  
**使用方法**:
```bash
mkdir -p .streamlit
cp .streamlit_config_example .streamlit/config.toml
```

**設定内容**:
- クライアント設定
- ロガー設定
- テーマ設定（ライト）
- サーバー設定

## ファイルサイズ統計

| ファイル | サイズ | 用途 |
|---------|--------|------|
| app.py | 22 KB | メインアプリ |
| database.py | 13 KB | DB操作 |
| ocr_utils.py | 7.5 KB | OCR処理 |
| image_utils.py | 5.7 KB | 画像処理 |
| README.md | 7.3 KB | ドキュメント |
| ARCHITECTURE.md | 9.8 KB | 設計書 |
| IMPLEMENTATION_CHECKLIST.md | 7.8 KB | チェックリスト |
| QUICK_START.md | 3.0 KB | 簡易ガイド |
| 設定等 | ~1 KB | 設定 |
| **合計** | **~128 KB** | **全体** |

## ファイル依存関係

```
app.py (メインアプリ)
├─→ database.py (DB操作)
├─→ image_utils.py (画像検証・処理)
├─→ ocr_utils.py (OCR抽出)
└─→ requirements.txt (依存パッケージ)
    ├─ streamlit
    ├─ Pillow
    ├─ pandas
    └─ python-dateutil
```

## 初回実行時に生成されるファイル

```
receipt_database.db        SQLiteデータベース
                          ├─ receipts テーブル（空）
                          ├─ receipt_audit_log テーブル（空）
                          └─ categories テーブル（8カテゴリー）

images/                    画像格納ディレクトリ
├─ 2024/
├─ 2025/
└─ ...

__pycache__/              Pythonコンパイル済みファイル
```

## ソースコード統計

```
Python コード:
├─ app.py               ~700行
├─ database.py          ~400行
├─ ocr_utils.py         ~300行
└─ image_utils.py       ~250行
合計: ~1,650行

ドキュメント:
├─ README.md            ~350行
├─ ARCHITECTURE.md      ~350行
├─ IMPLEMENTATION_CHECKLIST.md ~250行
├─ QUICK_START.md       ~150行
└─ FILE_MANIFEST.md     ~400行
合計: ~1,500行
```

## ライセンスと著作権

```
プロジェクト: 経費精算・レシート管理システム
バージョン: 1.0.0
作成日: 2024年4月10日
準拠: 電子帳簿保存法（令和5年改正対応）

ファイルの配布・改変: MIT License相当
（実装時は適切なライセンスを選択）
```

## 推奨環境

```
OS: Linux / macOS / Windows
Python: 3.8以上
Streamlit: 1.30以上
SQLite: 3.0以上（Pythonに組み込み）
```

---

**最終更新**: 2024年4月10日  
**ステータス**: 完成・テスト待機中

