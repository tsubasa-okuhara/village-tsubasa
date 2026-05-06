import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type DeleteSuccessResponse = {
  ok: true;
  id: string;
  deletedAt: string;
  updatedAt: string;
};

type DeleteConflictResponse = {
  ok: false;
  reason: "conflict";
  message: string;
};

type DeleteDenyResponse = {
  ok: false;
  reason:
    | "no_permission"
    | "not_registered"
    | "invalid_request"
    | "not_found";
  message: string;
};

type DeleteErrorResponse = {
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
  updated_at: string;
  deleted_at: string | null;
};

/**
 * 論理削除: schedule.deleted_at に現在時刻をセット
 * POST /api/schedule-editor/delete
 *   body: { id, email, expectedUpdatedAt }
 *
 * 楽観ロック: 編集と同様に updated_at を比較
 */
export async function handleScheduleEditorDelete(
  req: Request,
  res: Response<
    | DeleteSuccessResponse
    | DeleteConflictResponse
    | DeleteDenyResponse
    | DeleteErrorResponse
  >,
): Promise<void> {
  try {
    const body = req.body ?? {};
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";

    if (!id || !email || !expectedUpdatedAt) {
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message: "id / email / expectedUpdatedAt が必要です",
      });
      return;
    }

    const supabase = getSupabaseClient();

    // 認可チェック
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

    // 削除対象が存在するか + 楽観ロック
    const { data: current, error: fetchError } = await supabase
      .from("schedule")
      .select("id, updated_at, deleted_at")
      .eq("id", id)
      .maybeSingle<ScheduleRow>();

    if (fetchError) throw fetchError;
    if (!current) {
      res.status(404).json({
        ok: false,
        reason: "not_found",
        message: "対象の予定が見つかりません",
      });
      return;
    }
    if (current.deleted_at) {
      // 既に削除済み → 成功扱い（冪等性）
      res.status(200).json({
        ok: true,
        id: current.id,
        deletedAt: current.deleted_at,
        updatedAt: current.updated_at,
      });
      return;
    }
    if (current.updated_at !== expectedUpdatedAt) {
      res.status(409).json({
        ok: false,
        reason: "conflict",
        message:
          "他の人が同じ予定を変更しました。再読み込みして最新の内容を確認してください。",
      });
      return;
    }

    const now = new Date().toISOString();

    const { data: deleted, error: deleteError } = await supabase
      .from("schedule")
      .update({
        deleted_at: now,
        updated_at: now,
        synced_to_sheet: false, // GAS 月次フラッシュで反映させる
      })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .select("id, updated_at, deleted_at")
      .maybeSingle<ScheduleRow>();

    if (deleteError) throw deleteError;
    if (!deleted) {
      res.status(409).json({
        ok: false,
        reason: "conflict",
        message:
          "他の人が同じ予定を変更しました。再読み込みして最新の内容を確認してください。",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      id: deleted.id,
      deletedAt: deleted.deleted_at as string,
      updatedAt: deleted.updated_at,
    });
  } catch (error) {
    console.error("[scheduleEditor/delete] error:", error);
    res.status(500).json({
      ok: false,
      reason: "server_error",
      message: "サーバーエラーが発生しました",
    });
  }
}
