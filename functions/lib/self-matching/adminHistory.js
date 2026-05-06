"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminHistory = handleAdminHistory;
const supabase_1 = require("../lib/supabase");
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
function parseLimit(req) {
    const raw = req.query.limit;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string")
        return DEFAULT_LIMIT;
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0)
        return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}
function parseBefore(req) {
    const raw = req.query.before;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string" || value.trim() === "")
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
async function handleAdminHistory(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const limit = parseLimit(req);
    const before = parseBefore(req);
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("schedule_claims")
            .select("id, schedule_id, helper_email, status, decided_at, decided_by, updated_at")
            .in("status", ["approved", "rejected", "withdrawn"])
            .order("decided_at", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false })
            .limit(limit + 1);
        if (before) {
            query = query.lt("decided_at", before);
        }
        const { data: claimRows, error: claimErr } = await query;
        if (claimErr) {
            console.error("[self-matching/admin/history] claims query error:", claimErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const claims = (claimRows ?? []);
        const hasMore = claims.length > limit;
        const sliced = hasMore ? claims.slice(0, limit) : claims;
        if (sliced.length === 0) {
            res.status(200).json({ ok: true, items: [], hasMore: false });
            return;
        }
        const scheduleIds = Array.from(new Set(sliced.map((c) => String(c.schedule_id))));
        const helperEmails = Array.from(new Set(sliced.map((c) => String(c.helper_email).toLowerCase())));
        const [{ data: scheduleRows, error: scheduleErr }, { data: helperRows, error: helperErr }] = await Promise.all([
            supabase
                .from("schedule")
                .select("id, date, client, start_time, end_time")
                .in("id", scheduleIds),
            supabase
                .from("helper_master")
                .select("helper_email, helper_name, qualification")
                .in("helper_email", helperEmails),
        ]);
        if (scheduleErr) {
            console.error("[self-matching/admin/history] schedule query error:", scheduleErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (helperErr) {
            console.error("[self-matching/admin/history] helper query error:", helperErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const scheduleById = new Map();
        for (const row of (scheduleRows ?? [])) {
            scheduleById.set(String(row.id), row);
        }
        const helperByEmail = new Map();
        for (const row of (helperRows ?? [])) {
            helperByEmail.set(String(row.helper_email).toLowerCase(), row);
        }
        const items = sliced.map((claim) => {
            const schedule = scheduleById.get(String(claim.schedule_id));
            const helper = helperByEmail.get(String(claim.helper_email).toLowerCase());
            return {
                claimId: String(claim.id),
                scheduleId: String(claim.schedule_id),
                date: String(schedule?.date ?? ""),
                client: String(schedule?.client ?? ""),
                startTime: String(schedule?.start_time ?? ""),
                endTime: String(schedule?.end_time ?? ""),
                helperName: String(helper?.helper_name ?? ""),
                helperEmail: String(claim.helper_email),
                qualification: String(helper?.qualification ?? ""),
                status: String(claim.status),
                decidedAt: claim.decided_at,
                decidedBy: claim.decided_by,
            };
        });
        res.status(200).json({ ok: true, items, hasMore });
    }
    catch (error) {
        console.error("[self-matching/admin/history] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
