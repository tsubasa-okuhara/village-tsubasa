"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminReject = handleAdminReject;
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
async function handleAdminReject(req, res) {
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
        const { data: rejectedRow, error: rejectErr } = await supabase
            .from("schedule_claims")
            .update({
            status: "rejected",
            decided_at: new Date().toISOString(),
            decided_by: adminEmail,
        })
            .eq("id", parsed.claimId)
            .eq("status", "pending")
            .select("id, status, decided_at, decided_by")
            .maybeSingle();
        if (rejectErr) {
            console.error("[self-matching/admin/reject] update error:", rejectErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!rejectedRow) {
            res.status(409).json({
                ok: false,
                message: "claim not found or not pending",
                code: "not-pending",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            claim: {
                id: String(rejectedRow.id),
                status: String(rejectedRow.status),
                decidedAt: String(rejectedRow.decided_at),
                decidedBy: String(rejectedRow.decided_by),
            },
        });
    }
    catch (error) {
        console.error("[self-matching/admin/reject] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
