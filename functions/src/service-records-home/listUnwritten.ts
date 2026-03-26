import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type HomeScheduleTaskRow = {
  id: string;
  schedule_id: string | null;
  service_date: string;
  helper_name: string;
  helper_email: string | null;
  user_name: string;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  summary: string | null;
  beneficiary_number: string | null;
  status: string;
};

type ListUnwrittenHomeSuccessResponse = {
  ok: true;
  items: HomeScheduleTaskRow[];
};

type ListUnwrittenHomeErrorResponse = {
  ok: false;
  message: string;
};

function getHelperEmailFilter(req: Request): string | null {
  const helperEmailValue = Array.isArray(req.query.helper_email)
    ? req.query.helper_email[0]
    : req.query.helper_email;

  if (typeof helperEmailValue !== "string") {
    return null;
  }

  const trimmedHelperEmail = helperEmailValue.trim();
  return trimmedHelperEmail === "" ? null : trimmedHelperEmail;
}

export async function handleListUnwrittenHome(
  req: Request,
  res: Response<ListUnwrittenHomeSuccessResponse | ListUnwrittenHomeErrorResponse>
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const helperEmailFilter = getHelperEmailFilter(req);

    let query = supabase
      .from("home_schedule_tasks")
      .select(
        "id, schedule_id, service_date, helper_name, helper_email, user_name, start_time, end_time, task, summary, beneficiary_number, status"
      )
      .eq("status", "unwritten")
      .order("service_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true })
      .order("helper_name", { ascending: true });

    if (helperEmailFilter) {
      query = query.eq("helper_email", helperEmailFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.status(200).json({
      ok: true,
      items: (data ?? []) as HomeScheduleTaskRow[],
    });
  } catch (error) {
    console.error("[service-records-home/unwritten] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
