"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminPending = handleAdminPending;
const supabase_1 = require("../lib/supabase");
async function handleAdminPending(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: claimRows, error: claimErr } = await supabase
            .from("schedule_claims")
            .select("id, schedule_id, helper_email, note, created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: true });
        if (claimErr) {
            console.error("[self-matching/admin/pending] claims query error:", claimErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const claims = (claimRows ?? []);
        if (claims.length === 0) {
            res.status(200).json({ ok: true, items: [] });
            return;
        }
        const scheduleIds = Array.from(new Set(claims.map((c) => String(c.schedule_id))));
        const helperEmails = Array.from(new Set(claims.map((c) => String(c.helper_email).toLowerCase())));
        const { data: scheduleRows, error: scheduleErr } = await supabase
            .from("schedule")
            .select("id, date, client, start_time, end_time, task, haisha, summary, beneficiary_number, helper_email, deleted_at")
            .in("id", scheduleIds);
        if (scheduleErr) {
            console.error("[self-matching/admin/pending] schedule query error:", scheduleErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const { data: helperRows, error: helperErr } = await supabase
            .from("helper_master")
            .select("helper_email, helper_name, qualification")
            .in("helper_email", helperEmails);
        if (helperErr) {
            console.error("[self-matching/admin/pending] helper query error:", helperErr);
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
        const grouped = new Map();
        for (const claim of claims) {
            const scheduleId = String(claim.schedule_id);
            const schedule = scheduleById.get(scheduleId);
            if (!schedule)
                continue;
            if (schedule.deleted_at)
                continue;
            if (schedule.helper_email && String(schedule.helper_email).trim() !== "")
                continue;
            const helper = helperByEmail.get(String(claim.helper_email).toLowerCase());
            const claimItem = {
                claimId: String(claim.id),
                helperEmail: String(claim.helper_email),
                helperName: String(helper?.helper_name ?? ""),
                qualification: String(helper?.qualification ?? ""),
                createdAt: String(claim.created_at),
                note: claim.note,
            };
            const existing = grouped.get(scheduleId);
            if (existing) {
                existing.claims.push(claimItem);
                continue;
            }
            grouped.set(scheduleId, {
                scheduleId,
                date: String(schedule.date ?? ""),
                client: String(schedule.client ?? ""),
                startTime: String(schedule.start_time ?? ""),
                endTime: String(schedule.end_time ?? ""),
                task: String(schedule.task ?? ""),
                haisha: String(schedule.haisha ?? ""),
                summary: String(schedule.summary ?? ""),
                beneficiaryNumber: String(schedule.beneficiary_number ?? ""),
                claims: [claimItem],
            });
        }
        const items = Array.from(grouped.values()).sort((a, b) => {
            if (a.date !== b.date)
                return a.date < b.date ? -1 : 1;
            if (a.startTime !== b.startTime)
                return a.startTime < b.startTime ? -1 : 1;
            return 0;
        });
        res.status(200).json({ ok: true, items });
    }
    catch (error) {
        console.error("[self-matching/admin/pending] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
