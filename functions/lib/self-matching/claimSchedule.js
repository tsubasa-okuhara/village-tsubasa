"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleClaimSchedule = handleClaimSchedule;
const supabase_1 = require("../lib/supabase");
function parseBody(req) {
    const body = req.body;
    if (!body || typeof body !== "object")
        return null;
    const scheduleId = typeof body.scheduleId === "string"
        ? body.scheduleId.trim()
        : typeof body.schedule_id === "string"
            ? body.schedule_id.trim()
            : "";
    const helperEmail = typeof body.helperEmail === "string"
        ? body.helperEmail.trim()
        : typeof body.helper_email === "string"
            ? body.helper_email.trim()
            : "";
    const noteRaw = typeof body.note === "string" ? body.note.trim() : "";
    if (!scheduleId || !helperEmail)
        return null;
    return {
        scheduleId,
        helperEmail,
        note: noteRaw === "" ? null : noteRaw,
    };
}
async function handleClaimSchedule(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const parsed = parseBody(req);
    if (!parsed) {
        res
            .status(400)
            .json({ ok: false, message: "scheduleId and helperEmail are required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: helperRow, error: helperErr } = await supabase
            .from("helper_master")
            .select("helper_email, enable_self_matching")
            .ilike("helper_email", parsed.helperEmail)
            .maybeSingle();
        if (helperErr) {
            console.error("[self-matching/claim] helper lookup error:", helperErr);
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
        const { data: scheduleRow, error: scheduleErr } = await supabase
            .from("schedule")
            .select("id, helper_email, deleted_at, name")
            .eq("id", parsed.scheduleId)
            .maybeSingle();
        if (scheduleErr) {
            console.error("[self-matching/claim] schedule lookup error:", scheduleErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!scheduleRow) {
            res.status(404).json({ ok: false, message: "schedule not found" });
            return;
        }
        if (scheduleRow.deleted_at) {
            res
                .status(409)
                .json({ ok: false, message: "schedule has been deleted", code: "deleted" });
            return;
        }
        if (scheduleRow.helper_email && String(scheduleRow.helper_email).trim() !== "") {
            res
                .status(409)
                .json({ ok: false, message: "schedule already has a helper", code: "filled" });
            return;
        }
        const canonicalHelperEmail = String(helperRow.helper_email ?? parsed.helperEmail);
        const { data: insertedRows, error: insertErr } = await supabase
            .from("schedule_claims")
            .insert({
            schedule_id: parsed.scheduleId,
            helper_email: canonicalHelperEmail,
            status: "pending",
            note: parsed.note,
        })
            .select("id, schedule_id, helper_email, status, created_at")
            .maybeSingle();
        if (insertErr) {
            const code = insertErr.code;
            if (code === "23505") {
                res.status(409).json({
                    ok: false,
                    message: "you have already claimed this schedule",
                    code: "duplicate",
                });
                return;
            }
            console.error("[self-matching/claim] insert error:", insertErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!insertedRows) {
            res.status(500).json({ ok: false, message: "insert returned no row" });
            return;
        }
        res.status(200).json({
            ok: true,
            claim: {
                id: String(insertedRows.id),
                scheduleId: String(insertedRows.schedule_id),
                helperEmail: String(insertedRows.helper_email),
                status: String(insertedRows.status),
                createdAt: String(insertedRows.created_at),
            },
        });
    }
    catch (error) {
        console.error("[self-matching/claim] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
