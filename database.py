"""
データベース層モジュール
電子帳簿保存法対応のレシート管理システム用のデータベース操作

バックエンド:
- ローカル開発: SQLite (receipt_database.db)
- 本番 (Streamlit Cloud): Supabase (PostgreSQL)

環境変数 SUPABASE_URL / SUPABASE_KEY または Streamlit secrets に
[supabase] セクションがあれば Supabase を使用。

マルチユーザー対応:
- 各レシートは helper_email カラムで所有者を管理
- 全ての検索・更新・削除は helper_email でスコープされる
- 認証は Supabase Auth (メール + パスワード) を使用
- helper_master テーブルをホワイトリストとして利用
"""

import os
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional

# デフォルト費目カテゴリー（日本の経費分類）
DEFAULT_CATEGORIES = [
    "交通費",
    "接待交際費",
    "消耗品費",
    "通信費",
    "水道光熱費",
    "地代家賃",
    "雑費",
    "その他"
]

DB_PATH = "receipt_database.db"


# ============================================================
# バックエンド判定: Supabase が使えるかどうか
# ============================================================

def _get_supabase_client():
    """Supabase クライアントを取得（設定が無い場合は None）"""
    url = None
    key = None

    # 1. 環境変数から取得
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

    # 2. Streamlit secrets から取得
    if not url or not key:
        try:
            import streamlit as st
            if hasattr(st, "secrets") and "supabase" in st.secrets:
                url = url or st.secrets["supabase"].get("url")
                key = key or st.secrets["supabase"].get("key")
        except Exception:
            pass

    if not url or not key:
        return None

    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        return None
    except Exception as e:
        print(f"Supabase接続エラー: {e}")
        return None


def _use_supabase() -> bool:
    """Supabase を使用するかどうか"""
    return _get_supabase_client() is not None


# ============================================================
# 認証 (Supabase Auth + helper_master ホワイトリスト)
# ============================================================

def get_helper_by_email(email: str) -> Optional[Dict]:
    """
    helper_master テーブルから email で helper 情報を取得。
    大文字小文字を無視して検索する (ilike)。
    ローカル SQLite モードでは常に None (認証不要)。
    """
    if not email:
        return None
    email = email.strip()
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        res = (
            client.table("helper_master")
            .select("*")
            .ilike("helper_email", email)
            .execute()
        )
        if res.data:
            return res.data[0]
    except Exception as e:
        print(f"helper_master 取得エラー: {e}")
    return None


def sign_up_helper(email: str, password: str) -> Dict:
    """
    ヘルパー新規登録。
    - helper_master に登録されているメールかをホワイトリストチェック
    - Supabase Auth でユーザー作成
    Returns: {"ok": bool, "error": str, "helper": dict}
    """
    email = (email or "").strip().lower()
    if not email or not password:
        return {"ok": False, "error": "メールとパスワードを入力してください", "helper": None}

    if len(password) < 8:
        return {"ok": False, "error": "パスワードは8文字以上にしてください", "helper": None}

    client = _get_supabase_client()
    if client is None:
        return {"ok": False, "error": "Supabase が設定されていません", "helper": None}

    # ホワイトリストチェック (helper_master に大文字小文字問わず存在するか)
    try:
        res = client.table("helper_master").select("*").ilike("helper_email", email).execute()
        if not res.data:
            return {
                "ok": False,
                "error": "このメールアドレスは登録されていません。管理者にお問い合わせください。",
                "helper": None,
            }
        helper = res.data[0]
    except Exception as e:
        return {"ok": False, "error": f"helper_master 確認エラー: {e}", "helper": None}

    # Supabase Auth Admin API でサインアップ (メール確認をスキップ)
    # service_role キーを使っているため admin API が使える
    try:
        auth_res = client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,  # メール確認をスキップしてすぐログイン可能に
        })
        if auth_res.user is None:
            return {
                "ok": False,
                "error": "アカウント作成に失敗しました (既に登録済みの可能性があります)",
                "helper": None,
            }
        return {"ok": True, "error": "", "helper": helper}
    except Exception as e:
        msg = str(e)
        if (
            "already registered" in msg.lower()
            or "already_exists" in msg.lower()
            or "already been registered" in msg.lower()
            or "duplicate" in msg.lower()
        ):
            return {
                "ok": False,
                "error": "このメールアドレスは既に登録済みです。ログインしてください。",
                "helper": None,
            }
        return {"ok": False, "error": f"サインアップエラー: {msg}", "helper": None}


def sign_in_helper(email: str, password: str) -> Dict:
    """
    ヘルパーログイン。
    Returns: {"ok": bool, "error": str, "helper": dict, "session": any}
    """
    email = (email or "").strip().lower()
    if not email or not password:
        return {"ok": False, "error": "メールとパスワードを入力してください", "helper": None, "session": None}

    client = _get_supabase_client()
    if client is None:
        return {"ok": False, "error": "Supabase が設定されていません", "helper": None, "session": None}

    try:
        auth_res = client.auth.sign_in_with_password({"email": email, "password": password})
        if auth_res.user is None:
            return {"ok": False, "error": "メールアドレスまたはパスワードが違います", "helper": None, "session": None}
    except Exception as e:
        return {"ok": False, "error": "メールアドレスまたはパスワードが違います", "helper": None, "session": None}

    # helper_master から名前を取得
    helper = get_helper_by_email(email)
    if helper is None:
        return {"ok": False, "error": "helper_master に登録がありません", "helper": None, "session": None}

    return {"ok": True, "error": "", "helper": helper, "session": auth_res.session}


def sign_out_helper() -> None:
    """ログアウト (Supabase 側のセッションも破棄)"""
    client = _get_supabase_client()
    if client is None:
        return
    try:
        client.auth.sign_out()
    except Exception:
        pass


def _get_admin_emails() -> List[str]:
    """
    管理者メールアドレス一覧を取得。
    優先順位:
    1. 環境変数 ADMIN_EMAILS (カンマ区切り)
    2. Streamlit secrets の [admin] emails (リスト)
    """
    raw = os.environ.get("ADMIN_EMAILS", "")
    if raw:
        return [e.strip().lower() for e in raw.split(",") if e.strip()]

    try:
        import streamlit as st
        if hasattr(st, "secrets") and "admin" in st.secrets:
            emails = st.secrets["admin"].get("emails", [])
            if isinstance(emails, str):
                return [e.strip().lower() for e in emails.split(",") if e.strip()]
            return [str(e).strip().lower() for e in emails]
    except Exception:
        pass
    return []


def is_admin(email: str) -> bool:
    """メールアドレスが管理者かどうか"""
    if not email:
        return False
    return email.strip().lower() in _get_admin_emails()


# ============================================================
# SQLite 実装
# ============================================================

def _sqlite_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _sqlite_init():
    conn = _sqlite_conn()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            helper_email TEXT,
            helper_name TEXT,
            transaction_date TEXT NOT NULL,
            amount REAL NOT NULL,
            vendor TEXT,
            category TEXT NOT NULL,
            description TEXT,
            image_path TEXT,
            image_hash TEXT UNIQUE,
            image_dpi INTEGER,
            image_color_mode TEXT,
            scan_date TEXT NOT NULL,
            ocr_raw_text TEXT,
            phone_number TEXT,
            invoice_number TEXT,
            store_address TEXT,
            ai_confidence INTEGER,
            is_deleted INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            created_by TEXT DEFAULT 'system'
        )
    ''')

    # 既存テーブルに新カラムを追加 (ローカル開発の互換性)
    cursor.execute("PRAGMA table_info(receipts)")
    cols = {row[1] for row in cursor.fetchall()}
    for col_name, col_def in [
        ("helper_email", "TEXT"),
        ("helper_name", "TEXT"),
        ("phone_number", "TEXT"),
        ("invoice_number", "TEXT"),
        ("store_address", "TEXT"),
        ("ai_confidence", "INTEGER"),
    ]:
        if col_name not in cols:
            cursor.execute(f"ALTER TABLE receipts ADD COLUMN {col_name} {col_def}")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS receipt_audit_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_id INTEGER,
            action TEXT NOT NULL,
            changed_column TEXT,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT NOT NULL,
            changed_by TEXT DEFAULT 'system',
            reason TEXT,
            FOREIGN KEY(receipt_id) REFERENCES receipts(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        )
    ''')

    cursor.execute('SELECT COUNT(*) FROM categories')
    if cursor.fetchone()[0] == 0:
        for cat in DEFAULT_CATEGORIES:
            cursor.execute('''
                INSERT INTO categories (name, is_active, created_at)
                VALUES (?, ?, ?)
            ''', (cat, 1, datetime.now().isoformat()))

    conn.commit()
    conn.close()


# ============================================================
# Supabase 実装
# ============================================================

def _supabase_init():
    """Supabase 側は SQL で事前にテーブル作成済みが前提"""
    client = _get_supabase_client()
    if client is None:
        return
    try:
        res = client.table("receipt_categories").select("id").limit(1).execute()
        if not res.data:
            now = datetime.now().isoformat()
            rows = [{"name": c, "is_active": True, "created_at": now} for c in DEFAULT_CATEGORIES]
            client.table("receipt_categories").insert(rows).execute()
    except Exception as e:
        print(f"Supabase初期化警告: {e}")


# ============================================================
# 公開API (SQLite / Supabase を自動切替、helper_email でスコープ)
# ============================================================

def get_db_connection():
    """後方互換のためのSQLite接続取得（直接呼ぶのは非推奨）"""
    return _sqlite_conn()


def init_db():
    """データベースを初期化"""
    if _use_supabase():
        _supabase_init()
    else:
        _sqlite_init()


def insert_receipt(
    transaction_date: str,
    amount: float,
    vendor: str,
    category: str,
    description: str,
    image_path: str,
    image_hash: str,
    image_dpi: int,
    image_color_mode: str,
    helper_email: str,
    helper_name: str = "",
    ocr_raw_text: str = None,
    created_by: str = None,
    phone_number: Optional[str] = None,
    invoice_number: Optional[str] = None,
    store_address: Optional[str] = None,
    ai_confidence: Optional[int] = None,
) -> int:
    """新規レシートを登録 (helper_email必須)"""
    now = datetime.now().isoformat()
    if created_by is None:
        created_by = helper_email or "system"

    client = _get_supabase_client()
    if client is not None:
        try:
            res = client.table("receipts").insert({
                "helper_email": helper_email,
                "helper_name": helper_name,
                "transaction_date": transaction_date,
                "amount": amount,
                "vendor": vendor,
                "category": category,
                "description": description,
                "image_path": image_path,
                "image_hash": image_hash,
                "image_dpi": image_dpi,
                "image_color_mode": image_color_mode,
                "scan_date": now,
                "ocr_raw_text": ocr_raw_text,
                "phone_number": phone_number,
                "invoice_number": invoice_number,
                "store_address": store_address,
                "ai_confidence": ai_confidence,
                "is_deleted": False,
                "created_at": now,
                "updated_at": now,
                "created_by": created_by,
            }).execute()
            receipt_id = res.data[0]["id"]

            client.table("receipt_audit_log").insert({
                "receipt_id": receipt_id,
                "action": "INSERT",
                "changed_at": now,
                "changed_by": created_by,
                "reason": "初回登録",
            }).execute()
            return receipt_id
        except Exception as e:
            msg = str(e)
            if "duplicate" in msg.lower() or "unique" in msg.lower():
                raise ValueError(f"重複するハッシュ値です: {msg}")
            raise

    # SQLite
    conn = _sqlite_conn()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO receipts
            (helper_email, helper_name, transaction_date, amount, vendor, category, description,
             image_path, image_hash, image_dpi, image_color_mode,
             scan_date, ocr_raw_text, phone_number, invoice_number,
             store_address, ai_confidence, created_at, updated_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            helper_email, helper_name, transaction_date, amount, vendor, category, description,
            image_path, image_hash, image_dpi, image_color_mode,
            now, ocr_raw_text, phone_number, invoice_number,
            store_address, ai_confidence, now, now, created_by
        ))
        receipt_id = cursor.lastrowid

        cursor.execute('''
            INSERT INTO receipt_audit_log
            (receipt_id, action, changed_at, changed_by, reason)
            VALUES (?, ?, ?, ?, ?)
        ''', (receipt_id, 'INSERT', now, created_by, '初回登録'))

        conn.commit()
        return receipt_id
    except sqlite3.IntegrityError as e:
        conn.rollback()
        raise ValueError(f"重複するハッシュ値です: {str(e)}")
    finally:
        conn.close()


def update_receipt(
    receipt_id: int,
    helper_email: str,
    transaction_date: str = None,
    amount: float = None,
    vendor: str = None,
    category: str = None,
    description: str = None,
    reason: str = "",
    updated_by: str = None,
) -> bool:
    """
    既存レシートを更新（監査ログ記録付き）
    helper_email が一致しないレシートは更新不可 (所有権チェック)
    """
    now = datetime.now().isoformat()
    if updated_by is None:
        updated_by = helper_email or "system"

    client = _get_supabase_client()
    if client is not None:
        try:
            res = (
                client.table("receipts")
                .select("*")
                .eq("id", receipt_id)
                .eq("is_deleted", False)
                .eq("helper_email", helper_email)
                .execute()
            )
            if not res.data:
                return False
            current = res.data[0]

            updates = {}
            if transaction_date is not None and transaction_date != current["transaction_date"]:
                updates["transaction_date"] = transaction_date
            if amount is not None and amount != current["amount"]:
                updates["amount"] = amount
            if vendor is not None and vendor != current["vendor"]:
                updates["vendor"] = vendor
            if category is not None and category != current["category"]:
                updates["category"] = category
            if description is not None and description != current["description"]:
                updates["description"] = description

            if not updates:
                return True

            updates["updated_at"] = now
            client.table("receipts").update(updates).eq("id", receipt_id).execute()

            log_rows = []
            for col, new_val in updates.items():
                if col == "updated_at":
                    continue
                log_rows.append({
                    "receipt_id": receipt_id,
                    "action": "UPDATE",
                    "changed_column": col,
                    "old_value": str(current.get(col)),
                    "new_value": str(new_val),
                    "changed_at": now,
                    "changed_by": updated_by,
                    "reason": reason,
                })
            if log_rows:
                client.table("receipt_audit_log").insert(log_rows).execute()
            return True
        except Exception as e:
            print(f"Supabase更新エラー: {e}")
            return False

    # SQLite
    conn = _sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM receipts WHERE id = ? AND is_deleted = 0 AND (helper_email = ? OR helper_email IS NULL)',
        (receipt_id, helper_email),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    current_values = dict(row)
    updates = {}
    if transaction_date is not None and transaction_date != current_values['transaction_date']:
        updates['transaction_date'] = transaction_date
    if amount is not None and amount != current_values['amount']:
        updates['amount'] = amount
    if vendor is not None and vendor != current_values['vendor']:
        updates['vendor'] = vendor
    if category is not None and category != current_values['category']:
        updates['category'] = category
    if description is not None and description != current_values['description']:
        updates['description'] = description

    if not updates:
        conn.close()
        return True

    set_clause = ', '.join([f'{col} = ?' for col in updates.keys()])
    values = list(updates.values()) + [now, receipt_id]
    cursor.execute(f'''
        UPDATE receipts
        SET {set_clause}, updated_at = ?
        WHERE id = ?
    ''', values)

    for column, new_value in updates.items():
        cursor.execute('''
            INSERT INTO receipt_audit_log
            (receipt_id, action, changed_column, old_value, new_value, changed_at, changed_by, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            receipt_id, 'UPDATE', column,
            str(current_values[column]), str(new_value),
            now, updated_by, reason
        ))

    conn.commit()
    conn.close()
    return True


def soft_delete_receipt(
    receipt_id: int,
    helper_email: str,
    reason: str = "",
    deleted_by: str = None,
) -> bool:
    """
    レシートを論理削除（物理削除は禁止）
    helper_email が一致しないレシートは削除不可
    """
    now = datetime.now().isoformat()
    if deleted_by is None:
        deleted_by = helper_email or "system"

    client = _get_supabase_client()
    if client is not None:
        try:
            res = (
                client.table("receipts")
                .select("is_deleted")
                .eq("id", receipt_id)
                .eq("helper_email", helper_email)
                .execute()
            )
            if not res.data or res.data[0]["is_deleted"]:
                return False

            client.table("receipts").update({
                "is_deleted": True,
                "updated_at": now,
            }).eq("id", receipt_id).execute()

            client.table("receipt_audit_log").insert({
                "receipt_id": receipt_id,
                "action": "DELETE",
                "changed_at": now,
                "changed_by": deleted_by,
                "reason": reason,
            }).execute()
            return True
        except Exception as e:
            print(f"Supabase削除エラー: {e}")
            return False

    conn = _sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT is_deleted FROM receipts WHERE id = ? AND (helper_email = ? OR helper_email IS NULL)',
        (receipt_id, helper_email),
    )
    row = cursor.fetchone()
    if not row or row['is_deleted'] == 1:
        conn.close()
        return False

    cursor.execute('''
        UPDATE receipts
        SET is_deleted = 1, updated_at = ?
        WHERE id = ?
    ''', (now, receipt_id))

    cursor.execute('''
        INSERT INTO receipt_audit_log
        (receipt_id, action, changed_at, changed_by, reason)
        VALUES (?, ?, ?, ?, ?)
    ''', (receipt_id, 'DELETE', now, deleted_by, reason))

    conn.commit()
    conn.close()
    return True


def search_receipts(
    helper_email: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    vendor: Optional[str] = None,
) -> List[Dict]:
    """レシートを検索 (自分のレシートのみ)"""
    client = _get_supabase_client()
    if client is not None:
        try:
            q = (
                client.table("receipts")
                .select("*")
                .eq("is_deleted", False)
                .eq("helper_email", helper_email)
            )
            if date_from:
                q = q.gte("transaction_date", date_from)
            if date_to:
                q = q.lte("transaction_date", date_to)
            if amount_min is not None:
                q = q.gte("amount", amount_min)
            if amount_max is not None:
                q = q.lte("amount", amount_max)
            if vendor:
                q = q.ilike("vendor", f"%{vendor}%")
            q = q.order("transaction_date", desc=True)
            res = q.execute()
            return res.data or []
        except Exception as e:
            print(f"Supabase検索エラー: {e}")
            return []

    conn = _sqlite_conn()
    cursor = conn.cursor()
    query = 'SELECT * FROM receipts WHERE is_deleted = 0 AND (helper_email = ? OR helper_email IS NULL)'
    params = [helper_email]
    if date_from:
        query += ' AND transaction_date >= ?'
        params.append(date_from)
    if date_to:
        query += ' AND transaction_date <= ?'
        params.append(date_to)
    if amount_min is not None:
        query += ' AND amount >= ?'
        params.append(amount_min)
    if amount_max is not None:
        query += ' AND amount <= ?'
        params.append(amount_max)
    if vendor:
        query += ' AND vendor LIKE ?'
        params.append(f'%{vendor}%')
    query += ' ORDER BY transaction_date DESC'

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_receipt_by_id(receipt_id: int, helper_email: str) -> Optional[Dict]:
    """IDでレシートを取得 (自分のレシートのみ)"""
    client = _get_supabase_client()
    if client is not None:
        try:
            res = (
                client.table("receipts")
                .select("*")
                .eq("id", receipt_id)
                .eq("is_deleted", False)
                .eq("helper_email", helper_email)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception as e:
            print(f"Supabase取得エラー: {e}")
            return None

    conn = _sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM receipts WHERE id = ? AND is_deleted = 0 AND (helper_email = ? OR helper_email IS NULL)',
        (receipt_id, helper_email),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_audit_log(helper_email: str, receipt_id: Optional[int] = None) -> List[Dict]:
    """
    監査ログを取得 (自分のレシートの分のみ)
    ※receipt_id が指定されない場合は、自分のレシートに関する全ログを返す
    """
    client = _get_supabase_client()
    if client is not None:
        try:
            # 自分のレシートID一覧を取得
            my = (
                client.table("receipts")
                .select("id")
                .eq("helper_email", helper_email)
                .execute()
            )
            my_ids = [r["id"] for r in (my.data or [])]
            if not my_ids:
                return []

            q = client.table("receipt_audit_log").select("*")
            if receipt_id:
                if receipt_id not in my_ids:
                    return []
                q = q.eq("receipt_id", receipt_id)
            else:
                q = q.in_("receipt_id", my_ids)
            q = q.order("changed_at", desc=True)
            res = q.execute()
            return res.data or []
        except Exception as e:
            print(f"Supabase監査ログ取得エラー: {e}")
            return []

    conn = _sqlite_conn()
    cursor = conn.cursor()
    if receipt_id:
        cursor.execute('''
            SELECT l.* FROM receipt_audit_log l
            JOIN receipts r ON l.receipt_id = r.id
            WHERE l.receipt_id = ?
              AND (r.helper_email = ? OR r.helper_email IS NULL)
            ORDER BY l.changed_at DESC
        ''', (receipt_id, helper_email))
    else:
        cursor.execute('''
            SELECT l.* FROM receipt_audit_log l
            JOIN receipts r ON l.receipt_id = r.id
            WHERE (r.helper_email = ? OR r.helper_email IS NULL)
            ORDER BY l.changed_at DESC
        ''', (helper_email,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_categories(active_only: bool = True) -> List[str]:
    """カテゴリー一覧を取得 (ユーザー共通)"""
    client = _get_supabase_client()
    if client is not None:
        try:
            q = client.table("receipt_categories").select("name")
            if active_only:
                q = q.eq("is_active", True)
            q = q.order("name")
            res = q.execute()
            return [row["name"] for row in (res.data or [])]
        except Exception as e:
            print(f"Supabaseカテゴリー取得エラー: {e}")
            return list(DEFAULT_CATEGORIES)

    conn = _sqlite_conn()
    cursor = conn.cursor()
    if active_only:
        cursor.execute('SELECT name FROM categories WHERE is_active = 1 ORDER BY name')
    else:
        cursor.execute('SELECT name FROM categories ORDER BY name')
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]


def get_unique_vendors(helper_email: str) -> List[str]:
    """登録されている自分のユニークな取引先を取得"""
    client = _get_supabase_client()
    if client is not None:
        try:
            res = (
                client.table("receipts")
                .select("vendor")
                .eq("is_deleted", False)
                .eq("helper_email", helper_email)
                .execute()
            )
            vendors = set()
            for row in (res.data or []):
                if row.get("vendor"):
                    vendors.add(row["vendor"])
            return sorted(vendors)
        except Exception as e:
            print(f"Supabase取引先取得エラー: {e}")
            return []

    conn = _sqlite_conn()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT DISTINCT vendor FROM receipts
        WHERE is_deleted = 0 AND vendor IS NOT NULL
          AND (helper_email = ? OR helper_email IS NULL)
        ORDER BY vendor
    ''', (helper_email,))
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows if row[0]]


def search_all_receipts(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    vendor: Optional[str] = None,
    category: Optional[str] = None,
) -> List[Dict]:
    """
    管理者用: 全ヘルパーのレシートを検索 (helper_email でスコープしない)
    ※呼び出し側で is_admin チェックを必ず行うこと
    """
    client = _get_supabase_client()
    if client is not None:
        try:
            q = client.table("receipts").select("*").eq("is_deleted", False)
            if date_from:
                q = q.gte("transaction_date", date_from)
            if date_to:
                q = q.lte("transaction_date", date_to)
            if amount_min is not None:
                q = q.gte("amount", amount_min)
            if amount_max is not None:
                q = q.lte("amount", amount_max)
            if vendor:
                q = q.ilike("vendor", f"%{vendor}%")
            if category:
                q = q.eq("category", category)
            q = q.order("transaction_date", desc=True)
            res = q.execute()
            return res.data or []
        except Exception as e:
            print(f"Supabase全件検索エラー: {e}")
            return []

    conn = _sqlite_conn()
    cursor = conn.cursor()
    query = "SELECT * FROM receipts WHERE is_deleted = 0"
    params: list = []
    if date_from:
        query += " AND transaction_date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND transaction_date <= ?"
        params.append(date_to)
    if amount_min is not None:
        query += " AND amount >= ?"
        params.append(amount_min)
    if amount_max is not None:
        query += " AND amount <= ?"
        params.append(amount_max)
    if vendor:
        query += " AND vendor LIKE ?"
        params.append(f"%{vendor}%")
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY transaction_date DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_all_receipt_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict:
    """管理者用: 全ヘルパーのレシート統計情報"""
    client = _get_supabase_client()
    if client is not None:
        try:
            q = client.table("receipts").select("amount").eq("is_deleted", False)
            if date_from:
                q = q.gte("transaction_date", date_from)
            if date_to:
                q = q.lte("transaction_date", date_to)
            res = q.execute()
            rows = res.data or []
            return {
                "count": len(rows),
                "total": sum((r.get("amount") or 0) for r in rows),
            }
        except Exception as e:
            print(f"Supabase全件統計エラー: {e}")
            return {"count": 0, "total": 0.0}

    conn = _sqlite_conn()
    cursor = conn.cursor()
    query = "SELECT COUNT(*) as count, SUM(amount) as total FROM receipts WHERE is_deleted = 0"
    params: list = []
    if date_from:
        query += " AND transaction_date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND transaction_date <= ?"
        params.append(date_to)
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    return {"count": row["count"] or 0, "total": row["total"] or 0.0}


def get_receipt_stats(
    helper_email: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict:
    """レシート統計情報を取得 (自分のレシートのみ)"""
    client = _get_supabase_client()
    if client is not None:
        try:
            q = (
                client.table("receipts")
                .select("amount")
                .eq("is_deleted", False)
                .eq("helper_email", helper_email)
            )
            if date_from:
                q = q.gte("transaction_date", date_from)
            if date_to:
                q = q.lte("transaction_date", date_to)
            res = q.execute()
            rows = res.data or []
            return {
                "count": len(rows),
                "total": sum((r.get("amount") or 0) for r in rows),
            }
        except Exception as e:
            print(f"Supabase統計取得エラー: {e}")
            return {"count": 0, "total": 0.0}

    conn = _sqlite_conn()
    cursor = conn.cursor()
    query = '''
        SELECT COUNT(*) as count, SUM(amount) as total FROM receipts
        WHERE is_deleted = 0 AND (helper_email = ? OR helper_email IS NULL)
    '''
    params = [helper_email]
    if date_from:
        query += ' AND transaction_date >= ?'
        params.append(date_from)
    if date_to:
        query += ' AND transaction_date <= ?'
        params.append(date_to)
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    return {
        'count': row['count'] or 0,
        'total': row['total'] or 0.0
    }
