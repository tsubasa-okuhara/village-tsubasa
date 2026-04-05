"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNotifyToday = runNotifyToday;
exports.runNotifyTomorrow = runNotifyTomorrow;
exports.handleNotifyTodaySchedule = handleNotifyTodaySchedule;
exports.handleNotifyTomorrowSchedule = handleNotifyTomorrowSchedule;
const web_push_1 = __importDefault(require("web-push"));
const supabase_1 = require("./lib/supabase");
const push_1 = require("./push");
function configureWebPush() {
    web_push_1.default.setVapidDetails(push_1.WEB_PUSH_SUBJECT.value(), push_1.WEB_PUSH_VAPID_PUBLIC_KEY.value(), push_1.WEB_PUSH_VAPID_PRIVATE_KEY.value());
}
function getJstDateByOffset(dayOffset) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    const targetDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(targetDate);
}
async function sendNotificationsForDate(targetDate, notificationType, titlePrefix, linkPath) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    // 対象日に予定があるヘルパーのメールアドレスを取得
    const { data: scheduleData, error: scheduleError } = await supabase
        .from("schedule_web_v")
        .select("helper_email")
        .eq("date", targetDate)
        .not("helper_email", "is", null)
        .neq("helper_email", "");
    if (scheduleError) {
        throw scheduleError;
    }
    // ヘルパーごとの予定件数を集計
    const helperCounts = new Map();
    for (const row of (scheduleData ?? [])) {
        const email = row.helper_email.toLowerCase();
        helperCounts.set(email, (helperCounts.get(email) ?? 0) + 1);
    }
    if (helperCounts.size === 0) {
        return { notifiedCount: 0, sentCount: 0, failedCount: 0 };
    }
    configureWebPush();
    let notifiedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    for (const [helperEmail, scheduleCount] of helperCounts) {
        const title = `${titlePrefix}（${scheduleCount}件）`;
        const body = `${targetDate} の予定が${scheduleCount}件あります。タップして確認してください。`;
        // 通知レコードを作成
        await supabase.from("notifications").insert({
            target_email: helperEmail,
            title,
            body,
            link_url: `/${linkPath}/`,
            notification_type: notificationType,
        });
        // プッシュ通知を送信
        const { data: subData, error: subError } = await supabase
            .from("push_subscriptions")
            .select("id, helper_email, endpoint, p256dh_key, auth_key, is_active")
            .ilike("helper_email", helperEmail)
            .eq("is_active", true);
        if (subError || !subData || subData.length === 0) {
            notifiedCount += 1;
            continue;
        }
        const { count: unreadCount } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .ilike("target_email", helperEmail)
            .eq("is_read", false);
        const payload = JSON.stringify({
            title,
            body,
            icon: "/icons/app-icon.svg",
            badge: "/icons/app-badge.svg",
            url: `/${linkPath}/`,
            helperEmail,
            unreadCount: unreadCount ?? 0,
        });
        for (const row of subData) {
            const subscription = {
                endpoint: row.endpoint,
                keys: {
                    p256dh: String(row.p256dh_key ?? ""),
                    auth: String(row.auth_key ?? ""),
                },
            };
            try {
                await web_push_1.default.sendNotification(subscription, payload);
                sentCount += 1;
            }
            catch (error) {
                failedCount += 1;
                const statusCode = typeof error === "object" && error && "statusCode" in error
                    ? error.statusCode
                    : 0;
                if (statusCode === 404 || statusCode === 410) {
                    await supabase
                        .from("push_subscriptions")
                        .update({ is_active: false })
                        .eq("id", row.id);
                }
            }
        }
        notifiedCount += 1;
    }
    return { notifiedCount, sentCount, failedCount };
}
// Cloud Scheduler から呼ばれる関数（index.ts の onSchedule 用）
async function runNotifyToday() {
    const today = getJstDateByOffset(0);
    console.log("[scheduled-notify-today] sending for:", today);
    const result = await sendNotificationsForDate(today, "today", "今日の予定", "today-schedule");
    console.log("[scheduled-notify-today] result:", result);
}
async function runNotifyTomorrow() {
    const tomorrow = getJstDateByOffset(1);
    console.log("[scheduled-notify-tomorrow] sending for:", tomorrow);
    const result = await sendNotificationsForDate(tomorrow, "tomorrow", "明日の予定", "tomorrow-schedule");
    console.log("[scheduled-notify-tomorrow] result:", result);
}
// 当日の朝に呼ばれる: 今日の予定を通知
async function handleNotifyTodaySchedule(_req, res) {
    try {
        const today = getJstDateByOffset(0);
        console.log("[notify-today] sending notifications for:", today);
        const result = await sendNotificationsForDate(today, "today", "今日の予定", "today-schedule");
        console.log("[notify-today] result:", result);
        res.status(200).json({ ok: true, date: today, ...result });
    }
    catch (error) {
        console.error("[notify-today] error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
// 前日の夜に呼ばれる: 明日の予定を通知
async function handleNotifyTomorrowSchedule(_req, res) {
    try {
        const tomorrow = getJstDateByOffset(1);
        console.log("[notify-tomorrow] sending notifications for:", tomorrow);
        const result = await sendNotificationsForDate(tomorrow, "tomorrow", "明日の予定", "tomorrow-schedule");
        console.log("[notify-tomorrow] result:", result);
        res.status(200).json({ ok: true, date: tomorrow, ...result });
    }
    catch (error) {
        console.error("[notify-tomorrow] error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
