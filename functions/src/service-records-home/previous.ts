import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type PreviousRecord = {
  service_date: string;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  summary: string | null;
};

function getStr(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : "";
}

export async function handlePreviousHome(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "method not allowed" });
    return;
  }

  const userName = getStr(req.query.user_name);
  const before = getStr(req.query.before);

  if (!userName) {
    res.status(400).json({ ok: false, message: "user_name is required" });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("home_schedule_tasks")
      .select("service_date, start_time, end_time, task, summary")
      .eq("user_name", userName)
      .eq("status", "written")
      .is("deleted_at", null)
      .not("summary", "is", null)
      .order("service_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1);

    if (before) {
      query = query.lt("service_date", before);
    }

    const { data, error } = await query;
    if (error) throw error;

    const item = data && data.length > 0 ? (data[0] as PreviousRecord) : null;
    res.status(200).json({ ok: true, item });
  } catch (error) {
    console.error("[service-records-home/previous] error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
