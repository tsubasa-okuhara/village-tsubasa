import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type SaveRecordRequestBody = {
  taskId?: unknown;
  scheduleTaskId?: unknown;
  id?: unknown;
  note?: unknown;
  noteText?: unknown;
  content?: unknown;
  body?: unknown;
  memo?: unknown;
  recordText?: unknown;
  serviceDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  helperName?: unknown;
  helperEmail?: unknown;
  userName?: unknown;
  task?: unknown;
  summary?: unknown;
  summaryText?: unknown;
  beneficiaryNumber?: unknown;
  sourceKey?: unknown;
  [key: string]: unknown;
};

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
};

type SaveRecordSuccessResponse = {
  ok: true;
  taskId: string;
  message: string;
};

type SaveRecordErrorResponse = {
  ok: false;
  message: string;
};

type ServiceNotesMoveInsertPayload = {
  schedule_task_id: string;
  helper_email: string | null;
  helper_name: string | null;
  user_name: string | null;
  service_date: string;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  haisha: string | null;
  notes: string;
  summary_text: string | null;
};

type InsertedServiceNoteRow = {
  id?: string;
  schedule_task_id: string;
  created_at: string | null;
};

type UpdatedScheduleTaskRow = {
  id: string;
  status: string | null;
  updated_at: string | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getTaskId(body: SaveRecordRequestBody): string | null {
  return (
    asTrimmedString(body.taskId) ??
    asTrimmedString(body.scheduleTaskId) ??
    asTrimmedString(body.id)
  );
}

function getNoteText(body: SaveRecordRequestBody): string | null {
  return (
    asTrimmedString(body.note) ??
    asTrimmedString(body.noteText) ??
    asTrimmedString(body.content) ??
    asTrimmedString(body.body) ??
    asTrimmedString(body.memo) ??
    asTrimmedString(body.recordText)
  );
}

async function fetchScheduleTask(taskId: string): Promise<ScheduleTaskMoveRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select(
      "id, schedule_id, service_date, helper_name, helper_email, user_name, start_time, end_time, task, summary, summary_text, beneficiary_number, status, source_key"
    )
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("schedule task not found");
  }

  return data as ScheduleTaskMoveRow;
}

function toErrorLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { error };
  }

  const extendedError = error as Error & {
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    details: extendedError.details,
    hint: extendedError.hint,
    code: extendedError.code,
  };
}

function buildInsertPayload(
  body: SaveRecordRequestBody,
  task: ScheduleTaskMoveRow,
  noteText: string
): ServiceNotesMoveInsertPayload {
  return {
    schedule_task_id: task.id,
    helper_email: asTrimmedString(body.helperEmail) ?? task.helper_email,
    helper_name: asTrimmedString(body.helperName) ?? task.helper_name,
    user_name: asTrimmedString(body.userName) ?? task.user_name,
    service_date: asTrimmedString(body.serviceDate) ?? task.service_date,
    start_time: asTrimmedString(body.startTime) ?? task.start_time,
    end_time: asTrimmedString(body.endTime) ?? task.end_time,
    task: asTrimmedString(body.task) ?? task.task,
    haisha: null,
    notes: noteText,
    summary_text:
      asTrimmedString(body.summaryText) ??
      asTrimmedString(body.summary) ??
      task.summary_text ??
      task.summary,
  };
}

async function insertServiceNote(
  payload: ServiceNotesMoveInsertPayload
): Promise<InsertedServiceNoteRow> {
  const supabase = getSupabaseClient();
  console.info("[service-records-move/save] insert service_notes_move start", {
    scheduleTaskId: payload.schedule_task_id,
    helperEmail: payload.helper_email,
    serviceDate: payload.service_date,
    hasNotes: payload.notes.length > 0,
  });

  const { data, error, status, statusText } = await supabase
    .from("service_notes_move")
    .insert(payload)
    .select("schedule_task_id, created_at")
    .single();

  console.info("[service-records-move/save] insert service_notes_move result", {
    status,
    statusText,
    data,
    error: error
      ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      : null,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("service note insert returned no row");
  }

  return data as InsertedServiceNoteRow;
}

async function markScheduleTaskWritten(taskId: string): Promise<UpdatedScheduleTaskRow> {
  const supabase = getSupabaseClient();
  console.info("[service-records-move/save] update schedule_tasks_move start", {
    taskId,
    status: "written",
  });
  const { data, error, status, statusText } = await supabase
    .from("schedule_tasks_move")
    .update({
      status: "written",
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select("id, status, updated_at")
    .single();

  console.info("[service-records-move/save] update schedule_tasks_move result", {
    status,
    statusText,
    data,
    error: error
      ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      : null,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("schedule task update returned no row");
  }

  console.info("[service-records-move/save] update schedule_tasks_move success", {
    taskId,
    updatedStatus: data.status,
  });

  return data as UpdatedScheduleTaskRow;
}

export async function saveRecord(body: SaveRecordRequestBody): Promise<string> {
  const taskId = getTaskId(body);

  if (!taskId) {
    throw new Error("taskId is required");
  }

  const noteText = getNoteText(body);

  if (!noteText) {
    throw new Error("note is required");
  }

  const task = await fetchScheduleTask(taskId);
  const insertPayload = buildInsertPayload(body, task, noteText);

  const insertedNote = await insertServiceNote(insertPayload);
  console.info("[service-records-move/save] insert confirmed", insertedNote);
  const updatedTask = await markScheduleTaskWritten(task.id);
  console.info("[service-records-move/save] save completed", {
    taskId: task.id,
    insertedScheduleTaskId: insertedNote.schedule_task_id,
    updatedTaskId: updatedTask.id,
    updatedStatus: updatedTask.status,
  });

  return task.id;
}

export async function handleSaveRecord(
  req: Request,
  res: Response<SaveRecordSuccessResponse | SaveRecordErrorResponse>
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  try {
    const taskId = await saveRecord(req.body as SaveRecordRequestBody);
    res.status(200).json({
      ok: true,
      taskId,
      message: "saved",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal error";
    console.error("[service-records-move/save] error:", toErrorLog(error));
    res.status(500).json({
      ok: false,
      message,
    });
  }
}
