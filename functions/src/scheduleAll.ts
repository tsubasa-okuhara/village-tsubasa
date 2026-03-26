import type { Request, Response } from "express";

import { getDateJstByOffset } from "./helperSummary";
import { getSupabaseClient } from "./lib/supabase";

export type ScheduleAllItem = {
  id: string | number;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
};

export type ScheduleAllSuccessResponse = {
  ok: true;
  date: string;
  count: number;
  items: ScheduleAllItem[];
};

export type ScheduleAllErrorResponse = {
  ok: false;
  message: string;
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

export async function fetchScheduleAllByDate(date: string): Promise<ScheduleAllItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule")
    .select("id, date, name, client, start_time, end_time, haisha, task, summary")
    .eq("date", date)
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

export function createScheduleAllHandler(dayOffset: number, logLabel: string) {
  return async function handleScheduleAll(
    _req: Request,
    res: Response<ScheduleAllSuccessResponse | ScheduleAllErrorResponse>
  ): Promise<void> {
    try {
      const targetDate = getDateJstByOffset(dayOffset);
      const items = await fetchScheduleAllByDate(targetDate);

      res.status(200).json({
        ok: true,
        date: targetDate,
        count: items.length,
        items,
      });
    } catch (error) {
      console.error(`[${logLabel}] error:`, error);
      res.status(500).json({
        ok: false,
        message: "internal error",
      });
    }
  };
}
