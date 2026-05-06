import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import {
  normalizeDateString,
  normalizeText,
  normalizeTimeString,
} from "./normalize";

type ScheduleListItem = {
  id: string;
  date: string;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  updatedAt: string | null;
};

type CreateSuccessResponse = {
  ok: true;
  item: ScheduleListItem;
};

type CreateDenyResponse = {
  ok: false;
  reason:
    | "no_permission"
    | "not_registered"
    | "invalid_request";
  message: string;
};

type CreateErrorResponse = {
  ok: false;
  reason: "server_error";
  message: string;
};

type AdminUserRow = {
  email: string;
  can_edit_schedule: boolean;
};

type HelperRow = {
  helper_email: string | null;
};

type ViewRow = {
  id: string;
  date: string;
  name: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  updated_at: string;
};

/**
 * 新規予定の追加
 * POST /api/schedule-editor/create
 *   body: { email, date, name, client, startTime, endTime, haisha, task, summary, beneficiaryNumber }
 *
 * - 必須: email, date, client
 * - id は Supabase が自動採番
 * - helper_email は helper_master から自動補完（name が一致するレコードがあれば）
 * - source_key は null（editor 由来の行は同期キー無し）
 * - synced_to_sheet = false（GAS 月次フラッシュで反映）
 */
export async function handleScheduleEditorCreate(
  req: Request,
  res: Response<
    CreateSuccessResponse | CreateDenyResponse | CreateErrorResponse
  >,
): Promise<void> {
  try {
    const body = req.body ?? {};
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email) {
      res.status(400).json({
        ok: false,
        reason: "invalid_request",
        message: "email が必要です",
      });
      return;
    }

    // 入力値のバリデーション + 正規化（バリデーションエラーは invalid_request にまとめる）
    let date: string;
    let name: string | null;
    let client: string | null;
    let startTime: string | null;
    let endTime: string | null;
    let haisha: string | null;
    let task: string | null;
    let summary: string | null;
    let beneficiaryNumber: string | null;
    try {
      date = normalizeDateString(body.date);
      name = normalizeText(body.name);
      client = normalizeText(body.client);
      if (!client) {
        throw new Error("利用者名は必須です");
      }
      startTime = normalizeTimeString(body.startTime);
      endTime = normalizeTimeString(body.endTime);
      haisha = normalizeText(body.haisha);
      task = normalizeText(body.task);
      summary = normalizeText(body.summary);
      beneficiaryNumber = normalizeText(body.beneficiaryNumber);
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

    // helper_email を helper_master から自動補完
    let helperEmail: string | null = null;
    if (name) {
      const { data: helper, error: helperError } = await supabase
        .from("helper_master")
        .select("helper_email")
        .eq("helper_name", name)
        .maybeSingle<HelperRow>();
      if (helperError) {
        // helper_master 検索失敗は致命的ではない（手入力なら null のまま）
        console.warn(
          "[scheduleEditor/create] helper_master lookup failed:",
          helperError,
        );
      } else if (helper) {
        helperEmail = helper.helper_email ?? null;
      }
    }

    // INSERT（id・created_at・updated_at は Supabase が自動採番）
    const insertPayload = {
      date,
      name,
      helper_email: helperEmail,
      client,
      start_time: startTime,
      end_time: endTime,
      haisha,
      task,
      summary,
      beneficiary_number: beneficiaryNumber,
      synced_to_sheet: false,
      // source_key は意図的に未指定（null になる）
    };

    const { data: inserted, error: insertError } = await supabase
      .from("schedule")
      .insert(insertPayload)
      .select("id")
      .single<{ id: string }>();

    if (insertError) throw insertError;
    if (!inserted) {
      throw new Error("INSERT 結果が取得できませんでした");
    }

    // schedule_web_v 経由で取得し直して、レスポンスを一覧 API と同じ形に統一
    const { data: viewRow, error: viewError } = await supabase
      .from("schedule_web_v")
      .select(
        "id, date, name, client, start_time, end_time, haisha, task, summary, updated_at",
      )
      .eq("id", inserted.id)
      .maybeSingle<ViewRow>();

    if (viewError) throw viewError;
    if (!viewRow) {
      throw new Error(
        "INSERT は成功したが view 経由の再取得に失敗しました（id: " +
          inserted.id +
          "）",
      );
    }

    const item: ScheduleListItem = {
      id: viewRow.id,
      date: viewRow.date,
      helperName: viewRow.name,
      userName: viewRow.client,
      startTime: viewRow.start_time,
      endTime: viewRow.end_time,
      haisha: viewRow.haisha,
      task: viewRow.task,
      summary: viewRow.summary,
      updatedAt: viewRow.updated_at,
    };

    res.status(200).json({ ok: true, item });
  } catch (error) {
    console.error("[scheduleEditor/create] error:", error);
    res.status(500).json({
      ok: false,
      reason: "server_error",
      message: "サーバーエラーが発生しました",
    });
  }
}
