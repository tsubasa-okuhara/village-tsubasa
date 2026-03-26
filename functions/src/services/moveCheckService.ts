import { getSupabaseClient } from "../lib/supabase";
import type {
  CreateMoveCheckLogParams,
  MoveCheckLogItem,
  MoveCheckLogRow,
  MoveCheckUnwrittenItem,
  MoveCheckUnwrittenRow,
} from "../types/moveCheck";

function toUnwrittenItem(row: MoveCheckUnwrittenRow): MoveCheckUnwrittenItem {
  return {
    taskId: String(row.id ?? ""),
    helperEmail: String(row.helper_email ?? ""),
    serviceDate: String(row.date ?? ""),
    startTime: String(row.start_time ?? ""),
    endTime: String(row.end_time ?? ""),
    userName: String(row.user_name ?? ""),
    helperName: String(row.helper_name ?? ""),
    haisha: String(row.haisha ?? ""),
    task: String(row.task ?? ""),
    summary: String(row.summary ?? ""),
    raw: row,
  };
}

function toLogItem(row: MoveCheckLogRow): MoveCheckLogItem {
  return {
    id: String(row.id ?? ""),
    scheduleTaskId: String(row.schedule_task_id ?? ""),
    checkpointType: String(row.checkpoint_type ?? ""),
    checkpointLabel: String(row.checkpoint_label ?? ""),
    checkedAt: String(row.checked_at ?? ""),
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    accuracy: typeof row.accuracy === "number" ? row.accuracy : null,
    helperEmail: String(row.helper_email ?? ""),
    createdAt: String(row.created_at ?? ""),
    raw: row,
  };
}

export async function fetchMoveCheckUnwrittenTasks(
  helperEmail: string,
): Promise<MoveCheckUnwrittenItem[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select("*")
    .eq("helper_email", helperEmail)
    .eq("status", "unwritten")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MoveCheckUnwrittenRow[]).map(toUnwrittenItem);
}

export async function fetchMoveCheckLogs(taskId: string): Promise<MoveCheckLogItem[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("move_check_logs")
    .select("*")
    .eq("schedule_task_id", taskId)
    .order("checked_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MoveCheckLogRow[]).map(toLogItem);
}

export async function createMoveCheckLog(
  params: CreateMoveCheckLogParams,
): Promise<MoveCheckLogItem> {
  const supabase = getSupabaseClient();

  const insertPayload = {
    schedule_task_id: params.scheduleTaskId,
    checkpoint_type: params.checkpointType,
    checkpoint_label: params.checkpointLabel,
    checked_at: params.checkedAt,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy: params.accuracy,
    helper_email: params.helperEmail,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("move_check_logs")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return toLogItem(data as MoveCheckLogRow);
}
