"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetNotifications = handleGetNotifications;
exports.handleReadNotification = handleReadNotification;
const supabase_1 = require("./lib/supabase");
function getStringValue(value) {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0].trim() : "";
    }
    return typeof value === "string" ? value.trim() : "";
}
function toNotificationItem(row) {
    return {
        id: String(row.id),
        targetEmail: String(row.target_email ?? ""),
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        linkUrl: String(row.link_url ?? ""),
        notificationType: String(row.notification_type ?? ""),
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
    };
}
function getLimit(value) {
    const parsed = Number.parseInt(getStringValue(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 30;
    }
    return Math.min(parsed, 100);
}
async function handleGetNotifications(req, res) {
    const helperEmail = getStringValue(req.query.helper_email);
    const limit = getLimit(req.query.limit);
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const [{ data, error }, { count, error: countError }] = await Promise.all([
            supabase
                .from("notifications")
                .select("id, target_email, title, body, link_url, notification_type, is_read, created_at")
                .ilike("target_email", helperEmail)
                .order("created_at", { ascending: false })
                .limit(limit),
            supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .ilike("target_email", helperEmail)
                .eq("is_read", false),
        ]);
        if (error) {
            throw error;
        }
        if (countError) {
            throw countError;
        }
        const rows = (data ?? []);
        res.status(200).json({
            ok: true,
            helperEmail,
            unreadCount: count ?? 0,
            count: rows.length,
            items: rows.map(toNotificationItem),
        });
    }
    catch (error) {
        console.error("[notifications] get error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
async function handleReadNotification(req, res) {
    const id = getStringValue(req.body?.id);
    const helperEmail = getStringValue(req.body?.helper_email);
    if (!id) {
        res.status(400).json({
            ok: false,
            message: "id is required",
        });
        return;
    }
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id)
            .ilike("target_email", helperEmail)
            .select("id")
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            res.status(404).json({
                ok: false,
                message: "notification not found",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            id: String(data.id),
        });
    }
    catch (error) {
        console.error("[notifications/read] post error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
