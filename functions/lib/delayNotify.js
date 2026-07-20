"use strict";
/**
 * 遅延通知 API
 *
 *   POST /api/delay-notify
 *     { scheduleId: number, minutes: 10 | 20 | 30, helperName?: string }
 *
 *   1) schedule_entries（sub2）から予定を取得
 *   2) users を氏名で突合して line_group_id を取得
 *   3) LINE Messaging API で push
 *   4) delay_notices に送信ログを保存
 *
 * line_group_id が無い利用者は LINE 送信を行わず、
 * needsPhoneCall: true を返して画面側に「電話連絡が必要」と表示させる。
 *
 * 事前に必要な Secret:
 *   LINE_CHANNEL_ACCESS_TOKEN … Messaging API のチャネルアクセストークン
 *   （sub2 の service_role キーは既存の SUPABASE_SUB2_SERVICE_ROLE_KEY を流用）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINE_CHANNEL_ACCESS_TOKEN = void 0;
exports.handleDelayNotify = handleDelayNotify;
const params_1 = require("firebase-functions/params");
const supabase_1 = require("./lib/supabase");
exports.LINE_CHANNEL_ACCESS_TOKEN = (0, params_1.defineSecret)("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
/** 許可する遅延分数。想定外の値を弾いて誤送信を防ぐ */
const ALLOWED_MINUTES = [10, 20, 30];
/** 30分以上は管理者にもエスカレーションする */
const ESCALATION_THRESHOLD = 30;
async function handleDelayNotify(req, res) {
    try {
        const scheduleId = Number(req.body?.scheduleId);
        const minutes = Number(req.body?.minutes);
        const helperName = String(req.body?.helperName ?? "").trim();
        // 400 はいずれも呼び出し側の実装バグ。ヘルパーに原因を見せても行動が変わらないので
        // 画面には共通の文言だけ出し、原因は error に残して調査に回す
        if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
            return res.status(400).json({
                message: "送信できませんでした。事業所へご連絡ください。",
                error: "scheduleId が不正です",
            });
        }
        if (!ALLOWED_MINUTES.includes(minutes)) {
            return res.status(400).json({
                message: "送信できませんでした。事業所へご連絡ください。",
                error: "minutes は 10 / 20 / 30 のみ指定できます",
            });
        }
        const supabase = (0, supabase_1.getSupabaseSub2Client)();
        // ---- 1) 予定を取得 -----------------------------------------------------
        const { data: schedule, error: schedErr } = await supabase
            .from("schedule_entries")
            .select("id, date, start_time, end_time, user_name, helper_name, cancelled_at")
            .eq("id", scheduleId)
            .maybeSingle();
        if (schedErr)
            throw new Error(`予定の取得に失敗しました: ${schedErr.message}`);
        if (!schedule) {
            return res.status(404).json({
                message: "予定が見つかりません。画面を更新してください。",
                error: "予定が見つかりません",
            });
        }
        if (schedule.cancelled_at) {
            return res.status(409).json({
                message: "この予定はキャンセルされています。",
                error: "この予定はキャンセル済みです",
            });
        }
        const userName = (schedule.user_name ?? "").trim();
        if (!userName) {
            return res.status(409).json({
                message: "この予定に利用者名が登録されていません。事業所へご連絡ください。",
                error: "予定に利用者名が入っていません",
            });
        }
        // ---- 2) 二重送信チェック ----------------------------------------------
        // 同じ予定に対して既に送信済みなら弾く（ヘルパーの連打対策）
        const { data: already, error: alreadyErr } = await supabase
            .from("delay_notices")
            .select("id, minutes, sent_at")
            .eq("schedule_id", scheduleId)
            .eq("status", "sent")
            .order("sent_at", { ascending: false })
            .limit(1);
        // 送信済みか判定できないまま送ると二重送信になる。ここは送らずに止める
        if (alreadyErr) {
            throw new Error(`送信履歴の確認に失敗しました: ${alreadyErr.message}`);
        }
        if (already && already.length > 0) {
            return res.status(409).json({
                message: "この予定はすでに連絡済みです。",
                error: "この予定はすでに連絡済みです",
                previous: already[0],
            });
        }
        // ---- 3) 利用者の LINE ID を引く ---------------------------------------
        // schedule_entries は「小川貴也様」、users は「小川貴也」なので「様」を落として突合
        const normalized = normalizeName(userName);
        const { data: user, error: userErr } = await supabase
            .from("users")
            .select("id, name, line_group_id")
            .eq("name", normalized)
            .maybeSingle();
        if (userErr)
            throw new Error(`利用者の取得に失敗しました: ${userErr.message}`);
        const timeLabel = formatTime(schedule.start_time);
        const messageText = buildMessage(userName, timeLabel, minutes);
        // 突合できない、または LINE ID が無い場合は送信せず電話連絡へ回す
        if (!user || !user.line_group_id) {
            await logNotice(supabase, {
                schedule_id: scheduleId,
                client_name: userName,
                helper_name: helperName || schedule.helper_name,
                minutes,
                line_group_id: null,
                status: "needs_phone_call",
                message: messageText,
                error_message: user ? "LINE ID が未登録" : "users に該当する利用者がいません",
            });
            return res.json({
                ok: true,
                sent: false,
                needsPhoneCall: true,
                clientName: userName,
                message: user
                    ? `${userName} はLINE未登録です。お電話でご連絡ください。`
                    : `${userName} の利用者情報が見つかりません。事業所へご連絡ください。`,
                reason: user ? "この利用者様はLINE未登録です" : "利用者情報が見つかりません",
            });
        }
        // ---- 4) LINE 送信 ------------------------------------------------------
        try {
            await linePush(user.line_group_id, messageText, `delay-${scheduleId}-${minutes}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await logNotice(supabase, {
                schedule_id: scheduleId,
                client_name: userName,
                helper_name: helperName || schedule.helper_name,
                minutes,
                line_group_id: user.line_group_id,
                status: "failed",
                message: messageText,
                error_message: msg,
            });
            // 送信できなかったことをヘルパーに必ず伝える（黙って失敗させない）
            return res.status(502).json({
                ok: false,
                sent: false,
                needsPhoneCall: true,
                message: "送信できませんでした。事業所へお電話ください。",
                error: msg,
            });
        }
        await logNotice(supabase, {
            schedule_id: scheduleId,
            client_name: userName,
            helper_name: helperName || schedule.helper_name,
            minutes,
            line_group_id: user.line_group_id,
            status: "sent",
            message: messageText,
            error_message: null,
        });
        return res.json({
            ok: true,
            sent: true,
            needsPhoneCall: false,
            clientName: userName,
            message: `${userName} へ${minutes}分遅れる旨をLINEで連絡しました。`,
            minutes,
            escalated: minutes >= ESCALATION_THRESHOLD,
            sentAt: new Date().toISOString(),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[delay-notify]", msg);
        // 原因が何であれ「送れなかった＝電話連絡」に倒す。
        // message は画面へそのまま出す用、error は技術的な詳細（ログ・調査用）
        return res.status(500).json({
            ok: false,
            sent: false,
            needsPhoneCall: true,
            message: "送信できませんでした。事業所へお電話ください。",
            error: msg,
        });
    }
}
// ========== ヘルパー ==========
/** 「小川貴也様」→「小川貴也」。全角/半角スペースも除去する */
function normalizeName(raw) {
    return raw.replace(/[\s　]+/g, "").replace(/様$/, "");
}
/** "14:00:00" → "14:00"。取得できない場合は空文字 */
function formatTime(raw) {
    if (!raw)
        return "";
    const m = String(raw).match(/^(\d{1,2}):(\d{2})/);
    return m ? `${Number(m[1])}:${m[2]}` : "";
}
function buildMessage(userName, timeLabel, minutes) {
    const when = timeLabel ? `本日${timeLabel}〜のご訪問` : "本日のご訪問";
    const delay = minutes >= ESCALATION_THRESHOLD
        ? "担当ヘルパーが30分以上遅れる見込みです。"
        : `担当ヘルパーが${minutes}分ほど遅れます。`;
    return [
        "【ビレッジつばさ】",
        `${userName} ${when}`,
        delay,
        "ご迷惑をおかけし申し訳ありません。",
    ].join("\n");
}
/**
 * LINE Messaging API へ push する。
 * X-Line-Retry-Key を付けることで、リトライ時の重複配信を防ぐ。
 */
async function linePush(to, text, retryKeySeed) {
    const token = exports.LINE_CHANNEL_ACCESS_TOKEN.value();
    if (!token) {
        throw new Error("Secret LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
    }
    const resp = await fetch(LINE_PUSH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Line-Retry-Key": toUuid(retryKeySeed),
        },
        body: JSON.stringify({
            to,
            messages: [{ type: "text", text }],
        }),
    });
    if (resp.status !== 200) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status} ${body}`);
    }
}
/** 予定ID＋分数から決まった UUID を作る（同じ操作なら同じキーになる） */
function toUuid(seed) {
    const hex = Array.from(seed)
        .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7)
        .toString(16)
        .padStart(8, "0");
    const pad = (n) => hex.repeat(4).slice(0, n);
    return `${pad(8)}-${pad(4)}-4${pad(3)}-a${pad(3)}-${pad(12)}`;
}
/** ログ保存の失敗で送信処理自体を落とさない。ただし黙って失敗させない */
async function logNotice(supabase, log) {
    try {
        // supabase-js は失敗を例外ではなく error に入れて返すので、明示的に見る
        const { error } = await supabase
            .from("delay_notices")
            .insert({ ...log, sent_at: new Date().toISOString() });
        if (error) {
            console.error(`[delay-notify] ログ保存に失敗 schedule_id=${log.schedule_id} status=${log.status}: ${error.message}`);
        }
    }
    catch (e) {
        console.error(`[delay-notify] ログ保存で例外 schedule_id=${log.schedule_id} status=${log.status}`, e);
    }
}
