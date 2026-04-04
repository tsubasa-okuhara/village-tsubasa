import type { Request, Response } from "express";

import { getDateJstByOffset } from "./helperSummary";
import { getSupabaseClient } from "./lib/supabase";

type TomorrowScheduleItem = {
  id: string | number;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
};

type TomorrowScheduleSuccessResponse = {
  ok: true;
  date: string;
  helperEmail: string;
  count: number;
  items: TomorrowScheduleItem[];
};

type TomorrowScheduleErrorResponse = {
  ok: false;
  message: string;
};

type ScheduleRow = {
  id: string | number;
  date: string;
  name: string | null;
  helper_email: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
};

export async function fetchTomorrowScheduleByHelperEmail(
  helperEmail: string,
  date: string
): Promise<TomorrowScheduleItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, haisha, task, summary")
    .eq("date", date)
    .eq("helper_email", helperEmail)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ScheduleRow[];

  return rows.map(function (row) {
    return {
      id: row.id,
      helperName: row.name,
      userName: row.client,
      startTime: row.start_time,
      endTime: row.end_time,
      haisha: row.haisha,
      task: row.task,
      summary: row.summary,
    };
  });
}

export async function handleTomorrowSchedule(
  req: Request,
  res: Response<TomorrowScheduleSuccessResponse | TomorrowScheduleErrorResponse>
): Promise<void> {
  const helperEmailValue = Array.isArray(req.query.helper_email)
    ? req.query.helper_email[0]
    : req.query.helper_email;
  const helperEmail = typeof helperEmailValue === "string" ? helperEmailValue.trim() : "";

  if (helperEmail === "") {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  try {
    const tomorrowDate = getDateJstByOffset(1);
    const items = await fetchTomorrowScheduleByHelperEmail(helperEmail, tomorrowDate);

    res.status(200).json({
      ok: true,
      date: tomorrowDate,
      helperEmail: helperEmail,
      count: items.length,
      items: items,
    });
  } catch (error) {
    console.error("[tomorrow-schedule] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
