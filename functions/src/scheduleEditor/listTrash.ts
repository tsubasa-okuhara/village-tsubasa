import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type TrashItem = {
  id: string;
  date: string;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  deletedAt: string;
  updatedAt: string;
};

type TrashSuccessResponse = {
  ok: true;
  items: TrashItem[];
};

type TrashDenyResponse = {
  ok: false;
  reason:
    | "no_permission"
    | "not_registered"
    | "invalid_request";
  message: string;
};

type TrashErrorResponse = {
  ok: false;
  reason: "server_error";
  message: string;
};

type AdminUserRow = {
  email: string;
  can_edit_schedule: boolean;
};

type ScheduleRow = {
  id: string;
  date: string;
  name: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  deleted_at: string;
  updated_at: string;
};

/**
 * ゴミ箱一覧: deleted_at が NOT NULL の schedule を新しい順に返す
 * GET /api/schedule-editor/trash?email=xxx&days=90
 *
 * デフォルト 90 日以内に削除された行に絞る（パフォーマンス対策）
 */
export async function handleScheduleEditorListTrash(
  req: Request,
  res: Response<
    TrashSuccessResponse | TrashDenyResponse | TrashErrorResponse
  >,
): Promise<void> {
  try {
    const email = String(req.query.email || "").trim();
    if (!email) {
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message: "email が必要です",
      });
      return;
    }

    const daysParam = Number(req.query.days);
    const days =
      Number.isInteger(daysParam) && daysParam > 0 && daysParam <= 365
        ? daysParam
        : 90;

    const supabase = getSupabaseClient();

    const { data: user, error: userError } = await supabase
      .from("admin_users")
      .select("email, can_edit_schedule")
      .ilike("email", email.toLowerCase())
      .maybeSingle<AdminUserRow>();

    if (userError) throw userError;
    if (!user) {
      res.status(403).json({
        ok: false,
        reason: "not_registered",
        message: "登録されていないメールアドレスです",
      });
      return;
    }
    if (!user.can_edit_schedule) {
      res.status(403).json({
        ok: false,
        reason: "no_permission",
        message: "スケジュール編集権限がありません",
      });
      return;
    }

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceIso = sinceDate.toISOString();

    const { data, error } = await supabase
      .from("schedule")
      .select(
        "id, date, name, client, start_time, end_time, haisha, task, summary, deleted_at, updated_at",
      )
      .not("deleted_at", "is", null)
      .gte("deleted_at", sinceIso)
      .order("deleted_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = (data ?? []) as ScheduleRow[];
    const items: TrashItem[] = rows.map((row) => ({
      id: row.id,
      date: row.date,
      helperName: row.name,
      userName: row.client,
      startTime: row.start_time,
      endTime: row.end_time,
      haisha: row.haisha,
      task: row.task,
      summary: row.summary,
      deletedAt: row.deleted_at,
      updatedAt: row.updated_at,
    }));

    res.status(200).json({ ok: true, items });
  } catch (error) {
    console.error("[scheduleEditor/listTrash] error:", error);
    res.status(500).json({
      ok: false,
      reason: "server_error",
      message: "サーバーエラーが発生しました",
    });
  }
}
