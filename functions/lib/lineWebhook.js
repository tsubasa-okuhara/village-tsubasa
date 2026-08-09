"use strict";
/**
 * LINE Messaging API Webhook 受信
 *
 *   POST /api/line-webhook
 *
 * 目的（現時点）:
 *   テスト用 LINE グループの groupId を取得するための一時的な受信口。
 *   Bot をグループに招待する（join）か、グループ内で発言する（message）と
 *   その source.groupId を Cloud Logging に出力する。
 *
 *     [line-webhook] groupId=Cxxxx type=join
 *
 * やらないこと:
 *   - DB 書き込み・LINE 送信は一切しない。ログに出すだけ。
 *   - どのイベントでも必ず 200 を即返す（LINE は 2xx 以外だと再送してくるため）。
 *
 * 将来:
 *   groupId の自動登録（users.line_group_id への紐付け）の足場にする想定。
 *   そのため署名検証まで含めて「本番でも通る」形で書いておく。
 *
 * 事前に必要な Secret:
 *   LINE_CHANNEL_SECRET … Webhook 署名（X-Line-Signature）の検証に使う
 *                         チャネルシークレット（アクセストークンとは別物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINE_CHANNEL_SECRET = void 0;
exports.handleLineWebhook = handleLineWebhook;
const crypto_1 = require("crypto");
const params_1 = require("firebase-functions/params");
exports.LINE_CHANNEL_SECRET = (0, params_1.defineSecret)("LINE_CHANNEL_SECRET");
async function handleLineWebhook(req, res) {
    // ---- 署名検証 ----------------------------------------------------------
    // 失敗しても LINE には 200 を返す（4xx を返すと再送ループになるため）。
    // ただしイベントの中身は処理しない。
    const signature = headerValue(req, "x-line-signature");
    const rawBody = getRawBody(req);
    if (!verifySignature(rawBody, signature)) {
        console.warn("[line-webhook] 署名検証に失敗しました。イベントは無視します");
        return res.status(200).json({ ok: true, verified: false });
    }
    // ---- イベントを走査して groupId をログ出力 -----------------------------
    try {
        const events = extractEvents(req.body);
        for (const ev of events) {
            const groupId = ev.source?.groupId ?? ev.source?.roomId ?? "(none)";
            console.log(`[line-webhook] groupId=${groupId} type=${ev.type}`);
        }
    }
    catch (e) {
        // ログ出力で失敗しても 200 は返す（受信の成否と解析の成否を分ける）
        console.error("[line-webhook] イベント解析に失敗", e);
    }
    return res.status(200).json({ ok: true });
}
// ========== ヘルパー ==========
/** ヘッダを小文字キーで安全に1つ取り出す */
function headerValue(req, name) {
    const v = req.headers[name];
    if (Array.isArray(v))
        return v[0] ?? "";
    return typeof v === "string" ? v : "";
}
/**
 * 署名検証に使う生ボディを取得する。
 * Firebase Functions は express.json() でパースした後も
 * req.rawBody に元の Buffer を残してくれるので、それを最優先で使う。
 * 無い環境（ローカルなど）では JSON を文字列化してフォールバックする。
 */
function getRawBody(req) {
    const raw = req.rawBody;
    if (raw && Buffer.isBuffer(raw))
        return raw;
    return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}
/**
 * X-Line-Signature を検証する。
 * channel secret を鍵に、生ボディの HMAC-SHA256 を base64 化した値と一致するか。
 * 長さの違うバッファを timingSafeEqual に渡すと例外になるので、事前に弾く。
 */
function verifySignature(rawBody, signature) {
    if (!signature)
        return false;
    const secret = exports.LINE_CHANNEL_SECRET.value();
    if (!secret) {
        console.error("[line-webhook] Secret LINE_CHANNEL_SECRET が未設定です");
        return false;
    }
    const expected = (0, crypto_1.createHmac)("sha256", secret).update(rawBody).digest("base64");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(a, b);
}
/** req.body から events 配列を取り出す（形が想定外なら空配列） */
function extractEvents(body) {
    if (body && typeof body === "object" && Array.isArray(body.events)) {
        return body.events;
    }
    return [];
}
