import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type ScheduleRow = {
  id: string;
  date: string | null;
  name: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  haisha: string | null;
  summary: string | null;
  beneficiary_number: string | null;
};

type ClaimRow = {
  id: string;
  schedule_id: string;
  helper_email: string;
  status: string;
};

type CandidateItem = {
  scheduleId: string;
  date: string;
  client: string;
  startTime: string;
  endTime: string;
  task: string;
  haisha: string;
  summary: string;
  beneficiaryNumber: string;
  myClaimId: string | null;
  myClaimStatus: string | null;
  totalClaims: number;
};

type ListCandidatesSuccess = {
  ok: true;
  helperEmail: string;
  items: CandidateItem[];
};

type ListCandidatesError = {
  ok: false;
  message: string;
};

function getHelperEmail(req: Request): string | null {
  const v = req.query.helper_email;
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export async function handleListSelfMatchingCandidates(
  req: Request,
  res: Response<ListCandidatesSuccess | ListCandidatesError>
): Promise<void> {
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
    const supabase = getSupabaseClient();

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
      .select(
        "id, date, name, client, start_time, end_time, task, haisha, summary, beneficiary_number"
      )
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

    const filtered = (scheduleRows ?? []).filter((row: ScheduleRow) => {
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
    const claimsByScheduleId = new Map<
      string,
      { myId: string | null; mine: string | null; total: number }
    >();
    for (const claim of (claimRows ?? []) as ClaimRow[]) {
      const key = String(claim.schedule_id);
      const entry =
        claimsByScheduleId.get(key) ?? { myId: null, mine: null, total: 0 };
      entry.total += 1;
      if (String(claim.helper_email).toLowerCase() === lowerHelperEmail) {
        entry.mine = claim.status;
        entry.myId = String(claim.id);
      }
      claimsByScheduleId.set(key, entry);
    }

    const items: CandidateItem[] = filtered.map((row: ScheduleRow) => {
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
  } catch (error) {
    console.error("[self-matching/candidates] unexpected error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
