"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEB_PUSH_SUBJECT = exports.WEB_PUSH_VAPID_PRIVATE_KEY = exports.WEB_PUSH_VAPID_PUBLIC_KEY = void 0;
exports.handleGetPushPublicKey = handleGetPushPublicKey;
exports.handleSubscribePush = handleSubscribePush;
exports.handleUnsubscribePush = handleUnsubscribePush;
exports.handleSendTestPush = handleSendTestPush;
const params_1 = require("firebase-functions/params");
const web_push_1 = __importDefault(require("web-push"));
const supabase_1 = require("./lib/supabase");
exports.WEB_PUSH_VAPID_PUBLIC_KEY = (0, params_1.defineSecret)("WEB_PUSH_VAPID_PUBLIC_KEY");
exports.WEB_PUSH_VAPID_PRIVATE_KEY = (0, params_1.defineSecret)("WEB_PUSH_VAPID_PRIVATE_KEY");
exports.WEB_PUSH_SUBJECT = (0, params_1.defineSecret)("WEB_PUSH_SUBJECT");
async function fetchUnreadNotificationCount(helperEmail) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { count, error } = await supabase
        .from("notifications")
        .select("id", {
        count: "exact",
        head: true,
    })
        .eq("target_email", helperEmail)
        .eq("is_read", false);
    if (error) {
        throw error;
    }
    return Number(count) || 0;
}
function getStringValue(value) {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0].trim() : "";
    }
    return typeof value === "string" ? value.trim() : "";
}
function getNotificationText(value, fallback) {
    const text = getStringValue(value);
    return text || fallback;
}
function configureWebPush() {
    web_push_1.default.setVapidDetails(exports.WEB_PUSH_SUBJECT.value(), exports.WEB_PUSH_VAPID_PUBLIC_KEY.value(), exports.WEB_PUSH_VAPID_PRIVATE_KEY.value());
}
function getPushSubscriptionFromBody(body) {
    const payload = body;
    const endpoint = getStringValue(payload?.endpoint);
    const p256dh = getStringValue(payload?.keys?.p256dh);
    const auth = getStringValue(payload?.keys?.auth);
    if (!endpoint || !p256dh || !auth) {
        return null;
    }
    return {
        endpoint,
        keys: {
            p256dh,
            auth,
        },
    };
}
async function deactivateSubscriptionByEndpoint(endpoint) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { error } = await supabase
        .from("push_subscriptions")
        .update({
        is_active: false,
        updated_at: new Date().toISOString(),
    })
        .eq("endpoint", endpoint);
    if (error) {
        throw error;
    }
}
async function handleGetPushPublicKey(_req, res) {
    try {
        res.status(200).json({
            ok: true,
            publicKey: exports.WEB_PUSH_VAPID_PUBLIC_KEY.value(),
        });
    }
    catch (error) {
        console.error("[push/public-key] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
async function handleSubscribePush(req, res) {
    const helperEmail = getStringValue(req.body?.helperEmail);
    const userAgent = getStringValue(req.body?.userAgent);
    const subscription = getPushSubscriptionFromBody(req.body?.subscription);
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helperEmail is required",
        });
        return;
    }
    if (!subscription) {
        res.status(400).json({
            ok: false,
            message: "subscription is required",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("push_subscriptions")
            .upsert({
            helper_email: helperEmail,
            endpoint: subscription.endpoint,
            p256dh_key: subscription.keys.p256dh,
            auth_key: subscription.keys.auth,
            user_agent: userAgent || null,
            is_active: true,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: "endpoint",
        });
        if (error) {
            throw error;
        }
        res.status(200).json({
            ok: true,
            message: "subscription saved",
            subscribedCount: 1,
        });
    }
    catch (error) {
        console.error("[push/subscribe] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
async function handleUnsubscribePush(req, res) {
    const endpoint = getStringValue(req.body?.endpoint);
    if (!endpoint) {
        res.status(400).json({
            ok: false,
            message: "endpoint is required",
        });
        return;
    }
    try {
        await deactivateSubscriptionByEndpoint(endpoint);
        res.status(200).json({
            ok: true,
            message: "subscription deactivated",
            subscribedCount: 0,
        });
    }
    catch (error) {
        console.error("[push/unsubscribe] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
async function handleSendTestPush(req, res) {
    const helperEmail = getStringValue(req.body?.helperEmail);
    const title = getNotificationText(req.body?.title, "テスト通知");
    const body = getNotificationText(req.body?.body, "Web Push のテスト送信です。");
    const linkUrl = getNotificationText(req.body?.linkUrl, "/notifications/");
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helperEmail is required",
        });
        return;
    }
    try {
        configureWebPush();
        const supabase = (0, supabase_1.getSupabaseClient)();
        const unreadCount = await fetchUnreadNotificationCount(helperEmail);
        const { data, error } = await supabase
            .from("push_subscriptions")
            .select("id, helper_email, endpoint, p256dh_key, auth_key, user_agent, is_active, created_at, updated_at")
            .eq("helper_email", helperEmail)
            .eq("is_active", true);
        if (error) {
            throw error;
        }
        const rows = (data ?? []);
        if (rows.length === 0) {
            res.status(404).json({
                ok: false,
                message: "active subscription not found",
            });
            return;
        }
        let sentCount = 0;
        let failedCount = 0;
        let deactivatedCount = 0;
        const payload = JSON.stringify({
            title,
            body,
            icon: "/icons/app-icon.svg",
            badge: "/icons/app-badge.svg",
            url: linkUrl,
            helperEmail,
            unreadCount,
        });
        await Promise.all(rows.map(async function (row) {
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
                    ? Number(error.statusCode)
                    : 0;
                if (statusCode === 404 || statusCode === 410) {
                    await deactivateSubscriptionByEndpoint(row.endpoint);
                    deactivatedCount += 1;
                }
                console.error("[push/test] send error:", error);
            }
        }));
        res.status(200).json({
            ok: true,
            message: "test push sent",
            sentCount,
            failedCount,
            deactivatedCount,
        });
    }
    catch (error) {
        console.error("[push/test] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
