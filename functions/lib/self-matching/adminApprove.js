"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminApprove = handleAdminApprove;
const supabase_1 = require("../lib/supabase");
function parseBody(req) {
    const body = req.body;
    if (!body || typeof body !== "object")
        return null;
    const claimId = typeof body.claimId === "string"
        ? body.claimId.trim()
        : typeof body.claim_id === "string"
            ? body.claim_id.trim()
            : "";
    if (!claimId)
        return null;
    return { claimId };
}
async function handleAdminApprove(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const adminEmail = req.adminEmail;
    if (!adminEmail) {
        res.status(401).json({ ok: false, message: "admin email missing" });
        return;
    }
    const parsed = parseBody(req);
    if (!parsed) {
        res.status(400).json({ ok: false, message: "claimId is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: claimRow, error: claimErr } = await supabase
            .from("schedule_claims")
            .select("id, schedule_id, helper_email, status")
            .eq("id", parsed.claimId)
            .maybeSingle();
        if (claimErr) {
            console.error("[self-matching/admin/approve] claim lookup error:", claimErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!claimRow) {
            res.status(404).json({ ok: false, message: "claim not found" });
            return;
        }
        if (String(claimRow.status) !== "pending") {
            res.status(409).json({
                ok: false,
                message: "claim is not pending",
                code: "not-pending",
            });
            return;
        }
        const scheduleId = String(claimRow.schedule_id);
        const helperEmail = String(claimRow.helper_email);
        const { data: scheduleRow, error: scheduleErr } = await supabase
            .from("schedule")
            .select("id, helper_email, deleted_at")
            .eq("id", scheduleId)
            .maybeSingle();
        if (scheduleErr) {
            console.error("[self-matching/admin/approve] schedule lookup error:", scheduleErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!scheduleRow) {
            res.status(404).json({ ok: false, message: "schedule not found" });
            return;
        }
        if (scheduleRow.deleted_at) {
            res.status(409).json({
                ok: false,
                message: "schedule has been deleted",
                code: "deleted",
            });
            return;
        }
        if (scheduleRow.helper_email && String(scheduleRow.helper_email).trim() !== "") {
            res.status(409).json({
                ok: false,
                message: "schedule already has a helper",
                code: "filled",
            });
            return;
        }
        const { data: approvedRow, error: approveErr } = await supabase
            .from("schedule_claims")
            .update({
            status: "approved",
            decided_at: new Date().toISOString(),
            decided_by: adminEmail,
        })
            .eq("id", parsed.claimId)
            .eq("status", "pending")
            .select("id, schedule_id, helper_email, status, decided_at, decided_by")
            .maybeSingle();
        if (approveErr) {
            console.error("[self-matching/admin/approve] approve update error:", approveErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!approvedRow) {
            res.status(409).json({
                ok: false,
                message: "claim was already decided",
                code: "race-decided",
            });
            return;
        }
        const { data: scheduleUpdated, error: scheduleUpdateErr } = await supabase
            .from("schedule")
            .update({ helper_email: helperEmail })
            .eq("id", scheduleId)
            .is("helper_email", null)
            .select("id, helper_email")
            .maybeSingle();
        if (scheduleUpdateErr) {
            console.error("[self-matching/admin/approve] schedule update error, attempting rollback:", scheduleUpdateErr);
            await supabase
                .from("schedule_claims")
                .update({ status: "pending", decided_at: null, decided_by: null })
                .eq("id", parsed.claimId);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!scheduleUpdated) {
            console.warn("[self-matching/admin/approve] schedule.helper_email already set; rolling back claim");
            await supabase
                .from("schedule_claims")
                .update({ status: "pending", decided_at: null, decided_by: null })
                .eq("id", parsed.claimId);
            res.status(409).json({
                ok: false,
                message: "schedule was filled by another path",
                code: "filled",
            });
            return;
        }
        const { data: rejectedRows, error: rejectErr } = await supabase
            .from("schedule_claims")
            .update({
            status: "rejected",
            decided_at: new Date().toISOString(),
            decided_by: adminEmail,
        })
            .eq("schedule_id", scheduleId)
            .eq("status", "pending")
            .neq("id", parsed.claimId)
            .select("id");
        if (rejectErr) {
            console.error("[self-matching/admin/approve] reject other claims error (non-fatal):", rejectErr);
        }
        res.status(200).json({
            ok: true,
            claim: {
                id: String(approvedRow.id),
                scheduleId: String(approvedRow.schedule_id),
                helperEmail: String(approvedRow.helper_email),
                status: String(approvedRow.status),
                decidedAt: String(approvedRow.decided_at),
                decidedBy: String(approvedRow.decided_by),
            },
            otherRejected: (rejectedRows ?? []).length,
        });
    }
    catch (error) {
        console.error("[self-matching/admin/approve] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
