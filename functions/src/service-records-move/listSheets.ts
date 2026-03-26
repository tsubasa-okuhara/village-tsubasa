import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type ScheduleTaskMoveRow = {
  id: string;
  service_date: string;
  helper_name: string | null;
  user_name: string | null;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  summary: string | null;
  summary_text: string | null;
  beneficiary_number: string | null;
};

type ServiceNoteMoveRow = {
  schedule_task_id: string;
  helper_name: string | null;
  user_name: string | null;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  summary_text: string | null;
  created_at: string | null;
};

type SheetItem = {
  id: string;
  beneficiaryNumber: string | null;
  officeName: string;
  userName: string | null;
  helperName: string | null;
  serviceDate: string;
  serviceTime: string;
  destination: string;
  supportSummary: string;
  memo: string;
  route: string;
  depositAmount: string;
  usedAmount: string;
  expenseBreakdown: string;
};

type ListSheetsSuccessResponse = {
  ok: true;
  items: SheetItem[];
};

type ListSheetsErrorResponse = {
  ok: false;
  message: string;
};

function formatServiceTime(
  startTime: string | null,
  endTime: string | null,
): string {
  const start = startTime || "--:--";
  const end = endTime || "--:--";
  return `${start} - ${end}`;
}

function firstFilled(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function compareCreatedAtDesc(
  left: ServiceNoteMoveRow,
  right: ServiceNoteMoveRow,
): number {
  return String(right.created_at || "").localeCompare(String(left.created_at || ""));
}

async function fetchScheduleTasks(): Promise<ScheduleTaskMoveRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select(
      "id, service_date, helper_name, user_name, start_time, end_time, task, summary, summary_text, beneficiary_number",
    )
    .order("service_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ScheduleTaskMoveRow[];
}

async function fetchLatestNotesByTaskId(): Promise<Map<string, ServiceNoteMoveRow>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("service_notes_move")
    .select(
      "schedule_task_id, helper_name, user_name, service_date, start_time, end_time, notes, summary_text, created_at",
    )
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as ServiceNoteMoveRow[]).sort(compareCreatedAtDesc);
  const noteMap = new Map<string, ServiceNoteMoveRow>();

  rows.forEach((row) => {
    if (!noteMap.has(row.schedule_task_id)) {
      noteMap.set(row.schedule_task_id, row);
    }
  });

  return noteMap;
}

export async function listSheetItems(): Promise<SheetItem[]> {
  const [tasks, latestNotesByTaskId] = await Promise.all([
    fetchScheduleTasks(),
    fetchLatestNotesByTaskId(),
  ]);

  return tasks.map((task) => {
    const note = latestNotesByTaskId.get(task.id) || null;
    const destination = firstFilled(
      note?.summary_text,
      task.summary_text,
      task.summary,
      task.task,
    );

    return {
      id: task.id,
      beneficiaryNumber: task.beneficiary_number,
      officeName: "ビレッジ翼",
      userName: firstFilled(note?.user_name, task.user_name),
      helperName: firstFilled(note?.helper_name, task.helper_name),
      serviceDate: firstFilled(note?.service_date, task.service_date),
      serviceTime: formatServiceTime(
        note?.start_time ?? task.start_time,
        note?.end_time ?? task.end_time,
      ),
      destination,
      supportSummary: firstFilled(task.task, task.summary, task.summary_text),
      memo: firstFilled(note?.notes),
      route: "",
      depositAmount: "",
      usedAmount: "",
      expenseBreakdown: "",
    };
  });
}

export async function handleListSheets(
  req: Request,
  res: Response<ListSheetsSuccessResponse | ListSheetsErrorResponse>,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  try {
    const items = await listSheetItems();
    res.status(200).json({
      ok: true,
      items,
    });
  } catch (error) {
    console.error("[service-records-move/list-sheets] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
