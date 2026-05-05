import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type WithdrawSuccess = {
  ok: true;
  claim: {
    id: string;
    status: string;
    updatedAt: string;
  };
};

type WithdrawError = {
  ok: false;
  message: string;
  code?: string;
};

type ParsedBody = {
  claimId: string;
  helperEmail: string;
};

function parseBody(req: Request): ParsedBody | null {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return null;

  const claimId =
    typeof body.claimId === "string"
      ? body.claimId.trim()
      : typeof body.claim_id === "string"
        ? body.claim_id.trim()
        : "";
  const helperEmail =
    typeof body.helperEmail === "string"
      ? body.helperEmail.trim()
      : typeof body.helper_email === "string"
        ? body.helper_email.trim()
        : "";

  if (!claimId || !helperEmail) return null;
  return { claimId, helperEmail };
}

export async function handleWithdrawClaim(
  req: Request,
  res: Response<WithdrawSuccess | WithdrawError>
): Promise<void> {
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
    const supabase = getSupabaseClient();

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
        message:
          "claim not found, not yours, or already decided (cannot withdraw)",
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
  } catch (error) {
    console.error("[self-matching/withdraw] unexpected error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
