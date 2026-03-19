import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type MoveSaveRequestBody = {
  taskId?: unknown;
  helperEmail?: unknown;
  helperName?: unknown;
  userName?: unknown;
  serviceDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  task?: unknown;
  haisha?: unknown;
  notes?: unknown;
  summaryText?: unknown;
};

type MoveSaveSuccessResponse = {
  ok: true;
  taskId: string;
  message: string;
};

type MoveSaveErrorResponse = {
  ok: false;
  message: string;
};

function hasValidBody(value: unknown): value is MoveSaveRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string {
  return String(value ?? "").trim();
}

export async function handleServiceRecordsMoveSave(
  req: Request,
  res: Response<MoveSaveSuccessResponse | MoveSaveErrorResponse>,
): Promise<void> {
  if (!hasValidBody(req.body)) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  const taskId = getStringValue(req.body.taskId);
  const helperEmail = getStringValue(req.body.helperEmail);
  const notes = getStringValue(req.body.notes);
  const summaryText = getStringValue(req.body.summaryText);

  if (!taskId || !helperEmail || !notes || !summaryText) {
    res.status(400).json({
      ok: false,
      message: "taskId, helperEmail, notes and summaryText are required",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    // TODO: service_notes_move の実カラム名に合わせて調整する。
    const insertPayload = {
      schedule_task_move_id: taskId,
      helper_email: helperEmail,
      helper_name: getStringValue(req.body.helperName),
      user_name: getStringValue(req.body.userName),
      service_date: getStringValue(req.body.serviceDate),
      start_time: getStringValue(req.body.startTime),
      end_time: getStringValue(req.body.endTime),
      task: getStringValue(req.body.task),
      haisha: getStringValue(req.body.haisha),
      notes,
      summary_text: summaryText,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("service_notes_move").insert(insertPayload);

    if (insertError) {
      throw insertError;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("schedule_tasks_move")
      .update({
        status: "written",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("helper_email", helperEmail)
      .eq("status", "unwritten")
      .select("id");

    if (updateError) {
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      res.status(409).json({
        ok: false,
        message: "move task was already updated or not found",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      taskId,
      message: "move service record saved",
    });
  } catch (error) {
    console.error("[service-records-move/save] error:", error);
    res.status(500).json({
      ok: false,
      message: "failed to save move service record",
    });
  }
}
