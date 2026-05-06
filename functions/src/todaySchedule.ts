import type { Request, Response } from "express";

import { getSupabaseClient } from "./lib/supabase";

type TodayScheduleItem = {
  id: string | number;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  coHelpers: string[];   // 同 (client, start_time) の他ヘルパー名（合同シフト用）
};

type TodayScheduleSuccessResponse = {
  ok: true;
  date: string;
  helperEmail: string;
  count: number;
  items: TodayScheduleItem[];
};

type TodayScheduleErrorResponse = {
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

export function getTodayDateJst(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

export async function fetchTodayScheduleByHelperEmail(
  helperEmail: string,
  date: string
): Promise<TodayScheduleItem[]> {
  const supabase = getSupabaseClient();

  // 当日の全レコードを取得（合同シフト判定のため、本人以外も含めて全件）
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, haisha, task, summary")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  const allRows = (data ?? []) as ScheduleRow[];
  const helperEmailLc = helperEmail.toLowerCase();

  // 本人の行（helper_email 一致）を抽出
  const myRows = allRows.filter(function (r) {
    return (r.helper_email ?? "").toLowerCase() === helperEmailLc;
  });

  return myRows.map(function (row) {
    // 同 (client, start_time) で本人以外のヘルパー名を抽出（合同シフト）
    const coHelperSet = new Set<string>();
    for (const other of allRows) {
      if (other === row) continue;
      if (other.client !== row.client) continue;
      if (other.start_time !== row.start_time) continue;
      if (!other.name) continue;
      if (other.name === row.name) continue;
      coHelperSet.add(other.name);
    }

    return {
      id: row.id,
      helperName: row.name,
      userName: row.client,
      startTime: row.start_time,
      endTime: row.end_time,
      haisha: row.haisha,
      task: row.task,
      summary: row.summary,
      coHelpers: Array.from(coHelperSet),
    };
  });
}

export async function handleTodaySchedule(
  req: Request,
  res: Response<TodayScheduleSuccessResponse | TodayScheduleErrorResponse>
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
    const todayDate = getTodayDateJst();
    const items = await fetchTodayScheduleByHelperEmail(helperEmail, todayDate);

    res.status(200).json({
      ok: true,
      date: todayDate,
      helperEmail: helperEmail,
      count: items.length,
      items: items,
    });
  } catch (error) {
    console.error("[today-schedule] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
