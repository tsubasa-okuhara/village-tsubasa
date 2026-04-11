"""
レシート情報抽出モジュール (Claude Vision API)

Claude Haiku 4.5 のマルチモーダル Vision API を用いて、
画像から直接構造化情報（店名・日付・金額・電話番号・インボイス番号等）を抽出します。

特徴:
- easyocr/opencv/torch に依存しない (デプロイが高速)
- 電話番号を手がかりに店舗名を推論
- インボイス登録番号 (T+13桁) を自動抽出
- ロゴ化された店名も周辺情報から補完
- 信頼度スコアを自己採点

環境変数または Streamlit secrets で ANTHROPIC_API_KEY を取得します。
"""

import base64
import io
import json
import os
import re
from typing import Dict, Optional

from PIL import Image, ExifTags

# 使用するモデル
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

# 送信前画像のリサイズ上限 (API トークン節約)
MAX_IMAGE_SIDE = 1568


def _get_anthropic_api_key() -> Optional[str]:
    """Anthropic API キーを環境変数または Streamlit secrets から取得"""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    try:
        import streamlit as st
        if hasattr(st, "secrets") and "anthropic" in st.secrets:
            return st.secrets["anthropic"].get("api_key")
    except Exception:
        pass
    return None


def _fix_exif_rotation(image: Image.Image) -> Image.Image:
    """EXIF 情報に基づいて画像の向きを補正"""
    try:
        exif = image._getexif()
        if exif:
            for tag, value in exif.items():
                if ExifTags.TAGS.get(tag) == "Orientation":
                    if value == 3:
                        image = image.rotate(180, expand=True)
                    elif value == 6:
                        image = image.rotate(270, expand=True)
                    elif value == 8:
                        image = image.rotate(90, expand=True)
                    break
    except (AttributeError, TypeError):
        pass
    return image


def _prepare_image_for_api(image_bytes: bytes) -> tuple:
    """
    API 送信用に画像を加工 (EXIF回転補正 + リサイズ + JPEG再エンコード)

    Returns:
        (base64_str, media_type) のタプル
    """
    image = Image.open(io.BytesIO(image_bytes))
    image = _fix_exif_rotation(image)

    # RGB に正規化 (RGBA や P モードは JPEG にできない)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    # リサイズ (長辺 1568px 以下)
    w, h = image.size
    if max(w, h) > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=88, optimize=True)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return b64, "image/jpeg"


# Claude に渡すシステムプロンプト
_SYSTEM_PROMPT = """あなたは優秀な経費精算アシスタントです。
添付されたレシート画像から情報を極めて正確に抽出してください。

# 抽出のステップ (記載ミス防止ロジック)
1. **電話番号の優先確認**: 画像内に電話番号 (03-xxxx-xxxx 等) があれば最優先で特定し、その番号に紐づく一般的な店名を推論してください。
2. **インボイス登録番号の照合**: 「T」から始まる13桁の番号があれば抽出してください。
3. **ロゴ・周辺文字の解析**: 店名がロゴ化されていて読み取りにくい場合、レシート下部の住所や発行元記載から店名を補完してください。
4. **表記揺れの修正**: 「(株)」「ｶﾌｪ」などの表記は「株式会社」「カフェ」など正式名称に整えて出力してください。
5. **金額の特定**: 「合計」「税込」「領収金額」「お会計」等の最終金額を優先。商品単価や小計と混同しないこと。
6. **日付の特定**: 発行日・取引日を YYYY-MM-DD 形式で。令和年号は西暦に変換。

# 注意事項
- 読み取りが曖昧な場合は、無理に確定せず該当フィールドを null にしてください。
- 広告やクーポン情報の文字列を店名と混同しないよう注意してください。
- 信頼度スコアは 0-100 で自己採点してください (画質が悪い/推測が多い場合は低めに)。
- 出力は必ず JSON のみ。説明文や前置き、コードブロックは一切含めないでください。

# 出力フォーマット (必ずこのJSONスキーマに従う)
{
  "store_name": "店舗名 (例: スターバックスコーヒー 渋谷店) または null",
  "address": "住所 (例: 東京都渋谷区...) または null",
  "phone_number": "電話番号 (ハイフン区切り 例: 03-1234-5678) または null",
  "invoice_number": "Tから始まる13桁のインボイス登録番号 または null",
  "transaction_date": "取引日 (YYYY-MM-DD) または null",
  "total_amount": 税込合計金額の数値 (円, 整数) または null,
  "confidence_score": 0から100の整数,
  "confidence_note": "信頼度が低い場合はその理由 (短文)"
}
"""


def _extract_json_from_response(text: str) -> Optional[dict]:
    """Claude のレスポンスから JSON オブジェクトを取り出す"""
    text = text.strip()
    # コードブロックで囲まれている場合に対応
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # 余計な前後テキストがある場合、最初の { から最後の } までを抽出
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None


def _empty_result(reason: str = "") -> Dict:
    """全フィールドが空の結果を返す"""
    return {
        "store_name": None,
        "address": None,
        "phone_number": None,
        "invoice_number": None,
        "transaction_date": None,
        "total_amount": None,
        "confidence_score": 0,
        "confidence_note": reason or "抽出失敗",
        # 互換フィールド (app.py の既存コード用)
        "date": None,
        "amount": None,
        "vendor": None,
        "raw_text": reason or "抽出失敗",
    }


def extract_receipt_from_image(image_bytes: bytes) -> Dict:
    """
    レシート画像から直接、構造化情報を抽出する (Claude Vision API)

    Args:
        image_bytes: 画像バイナリ (JPEG/PNG)

    Returns:
        {
            "store_name": str | None,
            "address": str | None,
            "phone_number": str | None,
            "invoice_number": str | None,
            "transaction_date": "YYYY-MM-DD" | None,
            "total_amount": int | None,
            "confidence_score": int (0-100),
            "confidence_note": str,
            # 互換フィールド (既存フォームとの後方互換用)
            "date": "YYYY-MM-DD" | None,
            "amount": float | None,
            "vendor": str | None,
            "raw_text": str,  # JSON 文字列
        }
    """
    api_key = _get_anthropic_api_key()
    if not api_key:
        return _empty_result("ANTHROPIC_API_KEY が設定されていません")

    try:
        import anthropic
    except ImportError:
        return _empty_result("anthropic パッケージ未インストール")

    try:
        b64, media_type = _prepare_image_for_api(image_bytes)
    except Exception as e:
        return _empty_result(f"画像前処理エラー: {e}")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "このレシート画像から情報を抽出し、指定されたJSONスキーマで返してください。",
                        },
                    ],
                }
            ],
        )
    except Exception as e:
        return _empty_result(f"Claude API エラー: {e}")

    # レスポンスから JSON を取り出す
    try:
        raw_text = message.content[0].text
    except (IndexError, AttributeError):
        return _empty_result("Claude から空レスポンス")

    data = _extract_json_from_response(raw_text)
    if not data:
        return _empty_result(f"JSON パース失敗: {raw_text[:200]}")

    # 型の正規化 & 互換フィールドの追加
    store_name = data.get("store_name") or None
    address = data.get("address") or None
    phone_number = data.get("phone_number") or None
    invoice_number = data.get("invoice_number") or None
    transaction_date = data.get("transaction_date") or None

    amount_raw = data.get("total_amount")
    try:
        amount = float(amount_raw) if amount_raw is not None else None
    except (ValueError, TypeError):
        amount = None

    confidence_raw = data.get("confidence_score", 0)
    try:
        confidence = int(confidence_raw)
    except (ValueError, TypeError):
        confidence = 0
    confidence = max(0, min(100, confidence))

    confidence_note = data.get("confidence_note") or ""

    return {
        "store_name": store_name,
        "address": address,
        "phone_number": phone_number,
        "invoice_number": invoice_number,
        "transaction_date": transaction_date,
        "total_amount": amount,
        "confidence_score": confidence,
        "confidence_note": confidence_note,
        # 互換フィールド
        "date": transaction_date,
        "amount": amount,
        "vendor": store_name,
        "raw_text": json.dumps(data, ensure_ascii=False, indent=2),
    }
