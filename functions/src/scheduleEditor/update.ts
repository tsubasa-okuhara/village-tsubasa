import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import { normalizeTimeString } from "./normalize";

// フロント側で使う論理フィールド名 → schedule テーブルの実カラム名
// （"name" / "client" などは AG Grid に出している論理名と異なるので明示マップ）
const FIELD_MAP: Record<string, string> = {
  helperName: "name",
  userName: "client",
  startTime: "start_time",
  endTime: "end_time",
  haisha: "haisha",
  task: "task",
  summary: "summary",
};

const TIME_FIELDS = new Set(["start_time", "end_time"]);

type UpdateSuccessResponse = {
  ok: true;
  id: string;
  field: string;
  value: string | null;
  updatedAt: string;
};

type UpdateConflictResponse = {
  ok: false;
  reason: "conflict";
  currentUpdatedAt: string | null;
  message: string;
};

type UpdateDenyResponse = {
  ok: false;
  reason: "no_permission" | "not_registered" | "invalid_request" | "not_found";
  message: string;
};

type UpdateErrorResponse = {
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
};

function normalizeValue(rawField: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // 時刻列はスマート整形（共有ユーティリティ）
  if (TIME_FIELDS.has(rawField)) {
    return normalizeTimeString(value);
  }

  const str = String(value).trim();
  if (str === "") return null;
  return str;
}

export async function handleScheduleEditorUpdate(
  req: Request,
  res: Response<
    | UpdateSuccessResponse
    | UpdateConflictResponse
    | UpdateDenyResponse
    | UpdateErrorResponse
  >,
): Promise<void> {
  try {
    const body = req.body ?? {};
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const field = typeof body.field === "string" ? body.field.trim() : "";
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    const rawValue =
      body.value === undefined ? "" : (body.value as unknown);

    if (!id || !email || !field || !expectedUpdatedAt) {
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message: "id / email / field / expectedUpdatedAt が必要です",
      });
      return;
    }

    const dbField = FIELD_MAP[field];
    if (!dbField) {
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message: `編集できない列です: ${field}`,
      });
      return;
    }

    let normalizedValue: string | null;
    try {
      normalizedValue = normalizeValue(dbField, rawValue);
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : "入力値が不正です";
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message,
      });
      return;
    }

    const supabase = getSupabaseClient();

    // 認可チェック（auth.ts と同じロジック）
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

    // 楽観ロック: 現在の updated_at を取得して expectedUpdatedAt と比較
    const { data: current, error: fetchError } = await supabase
      .from("schedule")
      .select("id, updated_at")
      .eq("id", id)
      .maybeSingle<ScheduleRow>();

    if (fetchError) throw fetchError;
    if (!current) {
      res.status(404).json({
        ok: false,
        reason: "not_found",
        message: "対象の予定が見つかりません（削除された可能性があります）",
      });
      return;
    }

    if (current.updated_at !== expectedUpdatedAt) {
      res.status(409).json({
        ok: false,
        reason: "conflict",
        currentUpdatedAt: current.updated_at,
        message:
          "他の人が同じ予定を変更しました。再読み込みして最新の内容を確認してください。",
      });
      return;
    }

    // UPDATE して新しい updated_at を返す
    // updated_at は now() を明示的に入れる（DB トリガーが無くても確実に更新するため）
    const updatePayload: Record<string, unknown> = {
      [dbField]: normalizedValue,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await supabase
      .from("schedule")
      .update(updatePayload)
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt) // 同時編集対策の二重チェック
      .select("id, updated_at")
      .maybeSingle<ScheduleRow>();

    if (updateError) throw updateError;
    if (!updated) {
      // eq("updated_at", expectedUpdatedAt) で 0 行更新になった場合 = 競合
      res.status(409).json({
        ok: false,
        reason: "conflict",
        currentUpdatedAt: null,
        message:
          "他の人が同じ予定を変更しました。再読み込みして最新の内容を確認してください。",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      id: updated.id,
      field,
      value: normalizedValue,
      updatedAt: updated.updated_at,
    });
  } catch (error) {
    console.error("[scheduleEditor/update] error:", error);
    res.status(500).json({
      ok: false,
      reason: "server_error",
      message: "サーバーエラーが発生しました",
    });
  }
}
