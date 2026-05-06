import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type ClaimRow = {
  id: string;
  schedule_id: string;
  helper_email: string;
  status: string;
  decided_at: string | null;
  decided_by: string | null;
  updated_at: string;
};

type ScheduleRow = {
  id: string;
  date: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
};

type HelperRow = {
  helper_email: string;
  helper_name: string | null;
  qualification: string | null;
};

type HistoryItem = {
  claimId: string;
  scheduleId: string;
  date: string;
  client: string;
  startTime: string;
  endTime: string;
  helperName: string;
  helperEmail: string;
  qualification: string;
  status: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

type HistorySuccess = {
  ok: true;
  items: HistoryItem[];
  hasMore: boolean;
};

type HistoryError = {
  ok: false;
  message: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(req: Request): number {
  const raw = req.query.limit;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return DEFAULT_LIMIT;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseBefore(req: Request): string | null {
  const raw = req.query.before;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function handleAdminHistory(
  req: Request,
  res: Response<HistorySuccess | HistoryError>
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "method not allowed" });
    return;
  }

  const limit = parseLimit(req);
  const before = parseBefore(req);

  try {
    const supabase = getSupabaseClient();

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

    const claims = (claimRows ?? []) as ClaimRow[];
    const hasMore = claims.length > limit;
    const sliced = hasMore ? claims.slice(0, limit) : claims;

    if (sliced.length === 0) {
      res.status(200).json({ ok: true, items: [], hasMore: false });
      return;
    }

    const scheduleIds = Array.from(new Set(sliced.map((c) => String(c.schedule_id))));
    const helperEmails = Array.from(
      new Set(sliced.map((c) => String(c.helper_email).toLowerCase()))
    );

    const [{ data: scheduleRows, error: scheduleErr }, { data: helperRows, error: helperErr }] =
      await Promise.all([
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

    const scheduleById = new Map<string, ScheduleRow>();
    for (const row of (scheduleRows ?? []) as ScheduleRow[]) {
      scheduleById.set(String(row.id), row);
    }

    const helperByEmail = new Map<string, HelperRow>();
    for (const row of (helperRows ?? []) as HelperRow[]) {
      helperByEmail.set(String(row.helper_email).toLowerCase(), row);
    }

    const items: HistoryItem[] = sliced.map((claim) => {
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
  } catch (error) {
    console.error("[self-matching/admin/history] unexpected error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
