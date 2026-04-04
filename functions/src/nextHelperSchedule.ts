import type { Request, Response } from "express";

import { getSupabaseClient } from "./lib/supabase";
import { getDateJstByOffset } from "./helperSummary";

type NextHelperScheduleItem = {
  id: string | number;
  date: string;
  helperName: string | null;
  helperEmail: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  task: string | null;
};

type NextHelperScheduleSuccessResponse = {
  ok: true;
  helperEmail: string;
  item: NextHelperScheduleItem | null;
};

type NextHelperScheduleErrorResponse = {
  ok: false;
  message: string;
};

type NextScheduleRow = {
  id: string | number;
  date: string;
  name: string | null;
  helper_email: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
};

function getCurrentJstTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function mapScheduleRow(row: NextScheduleRow): NextHelperScheduleItem {
  return {
    id: row.id,
    date: row.date,
    helperName: row.name,
    helperEmail: row.helper_email,
    userName: row.client,
    startTime: row.start_time,
    endTime: row.end_time,
    task: row.task,
  };
}

async function fetchUpcomingScheduleOnDate(
  helperEmail: string,
  date: string,
  currentTime: string
): Promise<NextHelperScheduleItem | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, task")
    .ilike("helper_email", helperEmail)
    .eq("date", date)
    .gte("start_time", currentTime)
    .order("start_time", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = ((data ?? [])[0] ?? null) as NextScheduleRow | null;
  return row ? mapScheduleRow(row) : null;
}

async function fetchFutureSchedule(
  helperEmail: string,
  date: string
): Promise<NextHelperScheduleItem | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, task")
    .ilike("helper_email", helperEmail)
    .gt("date", date)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = ((data ?? [])[0] ?? null) as NextScheduleRow | null;
  return row ? mapScheduleRow(row) : null;
}

export async function handleNextHelperSchedule(
  req: Request,
  res: Response<NextHelperScheduleSuccessResponse | NextHelperScheduleErrorResponse>
): Promise<void> {
  const helperEmailValue = Array.isArray(req.query.helper_email)
    ? req.query.helper_email[0]
    : req.query.helper_email;
  const helperEmail = String(helperEmailValue ?? "").trim();

  if (helperEmail === "") {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  try {
    const targetDate = getDateJstByOffset(0);
    const currentTime = getCurrentJstTime();
    const todayItem = await fetchUpcomingScheduleOnDate(
      helperEmail,
      targetDate,
      currentTime
    );

    if (todayItem) {
      res.status(200).json({
        ok: true,
        helperEmail,
        item: todayItem,
      });
      return;
    }

    const futureItem = await fetchFutureSchedule(helperEmail, targetDate);
    res.status(200).json({
      ok: true,
      helperEmail,
      item: futureItem,
    });
  } catch (error) {
    console.error("[next-helper-schedule] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
