import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type MoveUnwrittenRow = {
  id: string;
  helper_email: string | null;
  status: string | null;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  user_name: string | null;
  helper_name: string | null;
  task: string | null;
  summary: string | null;
  summary_text: string | null;
  beneficiary_number: string | null;
  [key: string]: unknown;
};

type MoveUnwrittenItem = {
  taskId: string;
  helperEmail: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  userName: string;
  helperName: string;
  task: string;
  summary: string;
  summaryText: string;
  beneficiaryNumber: string;
  raw: MoveUnwrittenRow;
};

type ListUnwrittenSuccessResponse = {
  ok: true;
  helperEmail: string;
  items: MoveUnwrittenItem[];
};

type ListUnwrittenErrorResponse = {
  ok: false;
  message: string;
};

function getQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
}

function toItem(row: MoveUnwrittenRow): MoveUnwrittenItem {
  return {
    taskId: String(row.id ?? ""),
    helperEmail: String(row.helper_email ?? ""),
    serviceDate: String(row.service_date ?? ""),
    startTime: String(row.start_time ?? ""),
    endTime: String(row.end_time ?? ""),
    userName: String(row.user_name ?? ""),
    helperName: String(row.helper_name ?? ""),
    task: String(row.task ?? ""),
    summary: String(row.summary ?? ""),
    summaryText: String(row.summary_text ?? ""),
    beneficiaryNumber: String(row.beneficiary_number ?? ""),
    raw: row,
  };
}

export async function handleServiceRecordsMoveListUnwritten(
  req: Request,
  res: Response<ListUnwrittenSuccessResponse | ListUnwrittenErrorResponse>,
): Promise<void> {
  const helperEmail = getQueryValue(req.query.helper_email);

  if (!helperEmail) {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  console.log("[service-records-move/unwritten] request:", {
    helperEmail,
  });

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("schedule_tasks_move")
      .select(
        `
          id,
          helper_email,
          status,
          service_date,
          start_time,
          end_time,
          user_name,
          helper_name,
          task,
          summary,
          summary_text,
          beneficiary_number
        `,
      )
      .eq("helper_email", helperEmail)
      .eq("status", "unwritten")
      .order("service_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[service-records-move/unwritten] query error:", error);
      throw error;
    }

    const items = ((data ?? []) as MoveUnwrittenRow[]).map(toItem);

    console.log("[service-records-move/unwritten] success:", {
      helperEmail,
      count: items.length,
    });

    res.status(200).json({
      ok: true,
      helperEmail,
      items,
    });
  } catch (error) {
    console.error("[service-records-move/unwritten] runtime error:", error);
    res.status(500).json({
      ok: false,
      message: "failed to fetch unwritten move tasks",
    });
  }
}
