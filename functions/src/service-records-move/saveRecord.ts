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
  recordId: string;
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
  const helperName = getStringValue(req.body.helperName);
  const userName = getStringValue(req.body.userName);
  const serviceDate = getStringValue(req.body.serviceDate);
  const startTime = getStringValue(req.body.startTime);
  const endTime = getStringValue(req.body.endTime);
  const task = getStringValue(req.body.task);
  const haisha = getStringValue(req.body.haisha);
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

    const insertPayload = {
      schedule_task_id: taskId,
      helper_email: helperEmail,
      helper_name: helperName,
      user_name: userName,
      service_date: serviceDate,
      start_time: startTime,
      end_time: endTime,
      task,
      haisha,
      notes,
      summary_text: summaryText,
    };

    const { data: insertedRecord, error: insertError } = await supabase
      .from("service_notes_move")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    const recordId = String(insertedRecord?.id ?? "").trim();

    if (!recordId) {
      throw new Error("failed to resolve inserted move note id");
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
      // INSERT済みのレコードを削除して整合性を保つ
      const { error: rollbackError } = await supabase
        .from("service_notes_move")
        .delete()
        .eq("id", recordId);

      if (rollbackError) {
        console.error("[service-records-move/save] rollback failed:", rollbackError);
      }

      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      // タスクが更新されなかった（既にwritten等）のでINSERTを取り消す
      const { error: rollbackError } = await supabase
        .from("service_notes_move")
        .delete()
        .eq("id", recordId);

      if (rollbackError) {
        console.error("[service-records-move/save] rollback failed:", rollbackError);
      }

      res.status(409).json({
        ok: false,
        message: "move task was already updated or not found",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      recordId,
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
