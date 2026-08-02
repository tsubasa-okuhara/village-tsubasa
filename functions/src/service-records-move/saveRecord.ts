import type { Request, Response } from "express";

import { isSub2Date } from "../lib/scheduleSource";
import { saveSub2MoveRecord } from "../lib/serviceRecordsSub2";

// 保存先は sub2 の service_records_move。**INSERT ではなく UPDATE**。
// 設計の背景と旧DB 経路を落とした理由は service-records-home/saveRecord.ts の冒頭を参照。
//
// フロントは未記入一覧の `taskId`（= record_uuid）を送り返してくる。
// 書き込むのは summary_text と notes だけ（書き込み責任の分界点は
// docs/HANDOFF_2026-08-02_sub2_service_records.md §11）。

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

function hasValidBody(value: unknown): value is Record<string, unknown> {
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
      message: "保存に必要な情報が足りません。予定を選び直してください。",
    });
    return;
  }

  const recordUuid = getStringValue(req.body.taskId);
  const serviceDate = getStringValue(req.body.serviceDate);
  const summaryText = getStringValue(req.body.summaryText);
  // notes（メモ）は任意。空メモでも記録本文があれば保存を許可する
  const notes = getStringValue(req.body.notes);

  if (!recordUuid || !summaryText) {
    res.status(400).json({
      ok: false,
      message: "記録本文が未入力です。内容を入力してから保存してください。",
    });
    return;
  }

  if (!isSub2Date(serviceDate)) {
    res.status(400).json({
      ok: false,
      message:
        "2026年7月以前の記録はこの画面から保存できません。事業所にご連絡ください。",
    });
    return;
  }

  try {
    const outcome = await saveSub2MoveRecord(recordUuid, {
      summary_text: summaryText,
      notes: notes === "" ? null : notes,
    });

    if (outcome.status === "not_found") {
      res.status(404).json({
        ok: false,
        message:
          "この予定の記録が見つかりませんでした。予定が変更された可能性があります。一覧を読み込み直してください。",
      });
      return;
    }

    if (outcome.status === "already_written") {
      res.status(409).json({
        ok: false,
        message:
          "この予定はすでに記録が保存されています。修正が必要な場合は事業所にご連絡ください。",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      recordId: recordUuid,
      taskId: recordUuid,
      message: "move service record saved",
    });
  } catch (error) {
    console.error("[service-records-move/save] error:", error);
    res.status(500).json({
      ok: false,
      message: "保存に失敗しました。時間をおいて再試行してください。",
    });
  }
}
