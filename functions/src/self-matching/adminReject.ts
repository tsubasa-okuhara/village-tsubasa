import type { Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import type { AdminRequest } from "./adminAuth";

type RejectSuccess = {
  ok: true;
  claim: {
    id: string;
    status: string;
    decidedAt: string;
    decidedBy: string;
  };
};

type RejectError = {
  ok: false;
  message: string;
  code?: string;
};

type ParsedBody = {
  claimId: string;
};

function parseBody(req: AdminRequest): ParsedBody | null {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return null;

  const claimId =
    typeof body.claimId === "string"
      ? body.claimId.trim()
      : typeof body.claim_id === "string"
        ? body.claim_id.trim()
        : "";

  if (!claimId) return null;
  return { claimId };
}

export async function handleAdminReject(
  req: AdminRequest,
  res: Response<RejectSuccess | RejectError>
): Promise<void> {
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
    const supabase = getSupabaseClient();

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
  } catch (error) {
    console.error("[self-matching/admin/reject] unexpected error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
