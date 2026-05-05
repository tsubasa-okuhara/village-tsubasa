"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListSelfMatchingCandidates = handleListSelfMatchingCandidates;
const supabase_1 = require("../lib/supabase");
function getHelperEmail(req) {
    const v = req.query.helper_email;
    const raw = Array.isArray(v) ? v[0] : v;
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed;
}
async function handleListSelfMatchingCandidates(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const helperEmail = getHelperEmail(req);
    if (!helperEmail) {
        res.status(400).json({ ok: false, message: "helper_email is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: helperRow, error: helperErr } = await supabase
            .from("helper_master")
            .select("helper_name, helper_email, enable_self_matching")
            .ilike("helper_email", helperEmail)
            .maybeSingle();
        if (helperErr) {
            console.error("[self-matching/candidates] helper lookup error:", helperErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!helperRow) {
            res.status(404).json({ ok: false, message: "helper not found" });
            return;
        }
        if (!helperRow.enable_self_matching) {
            res.status(403).json({
                ok: false,
                message: "self-matching is not enabled for this helper",
            });
            return;
        }
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: scheduleRows, error: scheduleErr } = await supabase
            .from("schedule")
            .select("id, date, name, client, start_time, end_time, task, haisha, summary, beneficiary_number")
            .is("helper_email", null)
            .is("deleted_at", null)
            .gte("date", todayStr)
            .not("client", "is", null)
            .not("start_time", "is", null)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true });
        if (scheduleErr) {
            console.error("[self-matching/candidates] schedule query error:", scheduleErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const filtered = (scheduleRows ?? []).filter((row) => {
            const name = (row.name ?? "").trim();
            const client = (row.client ?? "").trim();
            return name === "" && client !== "";
        });
        if (filtered.length === 0) {
            res.status(200).json({
                ok: true,
                helperEmail: String(helperRow.helper_email ?? helperEmail),
                items: [],
            });
            return;
        }
        const scheduleIds = filtered.map((row) => String(row.id));
        const { data: claimRows, error: claimsErr } = await supabase
            .from("schedule_claims")
            .select("id, schedule_id, helper_email, status")
            .in("schedule_id", scheduleIds)
            .in("status", ["pending", "approved"]);
        if (claimsErr) {
            console.error("[self-matching/candidates] claims query error:", claimsErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        const lowerHelperEmail = helperEmail.toLowerCase();
        const claimsByScheduleId = new Map();
        for (const claim of (claimRows ?? [])) {
            const key = String(claim.schedule_id);
            const entry = claimsByScheduleId.get(key) ?? { myId: null, mine: null, total: 0 };
            entry.total += 1;
            if (String(claim.helper_email).toLowerCase() === lowerHelperEmail) {
                entry.mine = claim.status;
                entry.myId = String(claim.id);
            }
            claimsByScheduleId.set(key, entry);
        }
        const items = filtered.map((row) => {
            const claimInfo = claimsByScheduleId.get(String(row.id)) ?? {
                myId: null,
                mine: null,
                total: 0,
            };
            return {
                scheduleId: String(row.id),
                date: String(row.date ?? ""),
                client: String(row.client ?? ""),
                startTime: String(row.start_time ?? ""),
                endTime: String(row.end_time ?? ""),
                task: String(row.task ?? ""),
                haisha: String(row.haisha ?? ""),
                summary: String(row.summary ?? ""),
                beneficiaryNumber: String(row.beneficiary_number ?? ""),
                myClaimId: claimInfo.myId,
                myClaimStatus: claimInfo.mine,
                totalClaims: claimInfo.total,
            };
        });
        res.status(200).json({
            ok: true,
            helperEmail: String(helperRow.helper_email ?? helperEmail),
            items,
        });
    }
    catch (error) {
        console.error("[self-matching/candidates] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
