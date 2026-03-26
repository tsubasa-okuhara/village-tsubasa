import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type SaveHomeRecordRequestBody = {
  scheduleTaskId: string;
  serviceDate: string;
  helperName: string;
  helperEmail?: string | null;
  userName: string;
  task?: string | null;
  memo?: string | null;
  aiSummary?: string | null;
  finalNote: string;
};

type ServiceNoteHomeInsertRow = {
  schedule_task_id: string;
  service_date: string;
  helper_name: string;
  helper_email: string | null;
  user_name: string;
  task: string | null;
  memo: string | null;
  ai_summary: string | null;
  final_note: string;
};

type ServiceNoteHomeInsertedRow = {
  id: string;
};

type SaveHomeRecordSuccessResponse = {
  ok: true;
  recordId: string;
  scheduleTaskId: string;
  status: "written";
};

type SaveHomeRecordErrorResponse = {
  ok: false;
  message: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function parseSaveHomeRecordBody(body: unknown): SaveHomeRecordRequestBody | null {
  if (!isObject(body)) {
    return null;
  }

  const scheduleTaskId = normalizeRequiredText(body.scheduleTaskId);
  const serviceDate = normalizeRequiredText(body.serviceDate);
  const helperName = normalizeRequiredText(body.helperName);
  const helperEmail = normalizeOptionalText(body.helperEmail);
  const userName = normalizeRequiredText(body.userName);
  const task = normalizeOptionalText(body.task);
  const memo = normalizeOptionalText(body.memo);
  const aiSummary = normalizeOptionalText(body.aiSummary);
  const finalNote = normalizeRequiredText(body.finalNote);

  if (!scheduleTaskId || !serviceDate || !helperName || !userName || !finalNote) {
    return null;
  }

  return {
    scheduleTaskId,
    serviceDate,
    helperName,
    helperEmail,
    userName,
    task,
    memo,
    aiSummary,
    finalNote,
  };
}

async function rollbackInsertedHomeRecord(recordId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("service_notes_home").delete().eq("id", recordId);

  if (error) {
    console.error("[service-records-home/save] rollback error:", error);
  }
}

export async function handleSaveHomeRecord(
  req: Request,
  res: Response<SaveHomeRecordSuccessResponse | SaveHomeRecordErrorResponse>
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  const parsedBody = parseSaveHomeRecordBody(req.body);

  if (!parsedBody) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const insertPayload: ServiceNoteHomeInsertRow = {
      schedule_task_id: parsedBody.scheduleTaskId,
      service_date: parsedBody.serviceDate,
      helper_name: parsedBody.helperName,
      helper_email: parsedBody.helperEmail ?? null,
      user_name: parsedBody.userName,
      task: parsedBody.task ?? null,
      memo: parsedBody.memo ?? null,
      ai_summary: parsedBody.aiSummary ?? null,
      final_note: parsedBody.finalNote,
    };

    const { data: insertedRecord, error: insertError } = await supabase
      .from("service_notes_home")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    const insertedRecordId = (insertedRecord as ServiceNoteHomeInsertedRow).id;

    const { data: updatedTask, error: updateError } = await supabase
      .from("home_schedule_tasks")
      .update({ status: "written" })
      .eq("id", parsedBody.scheduleTaskId)
      .eq("status", "unwritten")
      .select("id")
      .maybeSingle();

    if (updateError) {
      await rollbackInsertedHomeRecord(insertedRecordId);
      throw updateError;
    }

    if (!updatedTask) {
      await rollbackInsertedHomeRecord(insertedRecordId);
      res.status(409).json({
        ok: false,
        message: "target schedule task is not unwritten",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      recordId: insertedRecordId,
      scheduleTaskId: parsedBody.scheduleTaskId,
      status: "written",
    });
  } catch (error) {
    console.error("[service-records-home/save] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
