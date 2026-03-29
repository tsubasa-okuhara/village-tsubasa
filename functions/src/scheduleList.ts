import type { Request, Response } from "express";

import { getSupabaseClient } from "./lib/supabase";

type ScheduleListItem = {
  id?: string | number;
  date: string;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
};

type ScheduleListSuccessResponse = {
  ok: true;
  year: number;
  month: number;
  items: ScheduleListItem[];
};

type ScheduleListErrorResponse = {
  ok: false;
  message: string;
};

type ParsedYearMonth = {
  year: number;
  month: number;
};

type ScheduleRow = {
  id: string | number;
  date: string;
  name: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
};

export function parseYearMonthParams(req: Request): ParsedYearMonth | null {
  const yearValue = Array.isArray(req.query.year) ? req.query.year[0] : req.query.year;
  const monthValue = Array.isArray(req.query.month) ? req.query.month[0] : req.query.month;
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export async function fetchScheduleList(
  year: number,
  month: number
): Promise<ScheduleListItem[]> {
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(year, month, 1);
  const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const rows: ScheduleRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("schedule_web_v")
      .select("id, date, name, client, start_time, end_time, haisha, task, summary")
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as ScheduleRow[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows.map(function (row) {
    return {
      id: row.id,
      date: row.date,
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

export async function handleScheduleList(
  req: Request,
  res: Response<ScheduleListSuccessResponse | ScheduleListErrorResponse>
): Promise<void> {
  const parsed = parseYearMonthParams(req);

  if (!parsed) {
    res.status(400).json({
      ok: false,
      message: "invalid year or month",
    });
    return;
  }

  try {
    const items = await fetchScheduleList(parsed.year, parsed.month);

    res.status(200).json({
      ok: true,
      year: parsed.year,
      month: parsed.month,
      items: items,
    });
  } catch (error) {
    console.error("[schedule-list] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
