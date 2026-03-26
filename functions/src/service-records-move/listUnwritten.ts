import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type ScheduleTaskMoveRow = {
  id: string;
  schedule_id: string | null;
  service_date: string;
  helper_name: string | null;
  helper_email: string | null;
  user_name: string | null;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  summary: string | null;
  summary_text: string | null;
  beneficiary_number: string | null;
  status: string | null;
  source_key: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ListItem = {
  id: string;
  scheduleId: string | null;
  serviceDate: string;
  helperName: string | null;
  helperEmail: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  task: string | null;
  summary: string | null;
  summaryText: string | null;
  beneficiaryNumber: string | null;
  status: string | null;
  sourceKey: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ListSuccessResponse = {
  ok: true;
  items: ListItem[];
};

type ListErrorResponse = {
  ok: false;
  message: string;
};

function toItem(row: ScheduleTaskMoveRow): ListItem {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    serviceDate: row.service_date,
    helperName: row.helper_name,
    helperEmail: row.helper_email,
    userName: row.user_name,
    startTime: row.start_time,
    endTime: row.end_time,
    task: row.task,
    summary: row.summary,
    summaryText: row.summary_text,
    beneficiaryNumber: row.beneficiary_number,
    status: row.status,
    sourceKey: row.source_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUnwritten(): Promise<ListItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select(
      "id, schedule_id, service_date, helper_name, helper_email, user_name, start_time, end_time, task, summary, summary_text, beneficiary_number, status, source_key, created_at, updated_at"
    )
    .eq("status", "unwritten")
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true, nullsFirst: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ScheduleTaskMoveRow[]).map(toItem);
}

export async function handleListUnwritten(
  req: Request,
  res: Response<ListSuccessResponse | ListErrorResponse>
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  try {
    const items = await listUnwritten();
    res.status(200).json({
      ok: true,
      items,
    });
  } catch (error) {
    console.error("[service-records-move/list-unwritten] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
