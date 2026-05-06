"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWithdrawClaim = handleWithdrawClaim;
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
    const helperEmail = typeof body.helperEmail === "string"
        ? body.helperEmail.trim()
        : typeof body.helper_email === "string"
            ? body.helper_email.trim()
            : "";
    if (!claimId || !helperEmail)
        return null;
    return { claimId, helperEmail };
}
async function handleWithdrawClaim(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const parsed = parseBody(req);
    if (!parsed) {
        res
            .status(400)
            .json({ ok: false, message: "claimId and helperEmail are required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: updatedRow, error: updateErr } = await supabase
            .from("schedule_claims")
            .update({ status: "withdrawn" })
            .eq("id", parsed.claimId)
            .ilike("helper_email", parsed.helperEmail)
            .eq("status", "pending")
            .select("id, status, updated_at")
            .maybeSingle();
        if (updateErr) {
            console.error("[self-matching/withdraw] update error:", updateErr);
            res.status(500).json({ ok: false, message: "internal error" });
            return;
        }
        if (!updatedRow) {
            res.status(409).json({
                ok: false,
                message: "claim not found, not yours, or already decided (cannot withdraw)",
                code: "not-withdrawable",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            claim: {
                id: String(updatedRow.id),
                status: String(updatedRow.status),
                updatedAt: String(updatedRow.updated_at),
            },
        });
    }
    catch (error) {
        console.error("[self-matching/withdraw] unexpected error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
