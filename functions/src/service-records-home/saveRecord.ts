import type { Request, Response } from "express";

import { isSub2Date } from "../lib/scheduleSource";
import { saveSub2HomeRecord } from "../lib/serviceRecordsSub2";

// 保存先は sub2 の service_records_home。**INSERT ではなく UPDATE**。
//
// GAS（独立プロジェクト「サービス記録転送 sub2」）が record_uuid を発行して
// 本文が空の行を先に作っているので、アプリはその行を埋める。
// フロントは未記入一覧の `id`（= record_uuid）を scheduleTaskId として送り返してくる。
//
// 旧DB（service_notes_home への INSERT + home_schedule_tasks の status 更新 +
// 失敗時のロールバック）は経路ごと削除した。理由:
//   - 未記入一覧が RECORD_LIST_CUTOFF_DATE = 2026-08-01 以降しか出さないため、
//     ヘルパーの画面から 7月以前の保存要求は発生しない
//   - 7/31 以前の未記入は事業所側で精査する運用（lib/recordCutoff.ts）
//   - 残すと「二重の書き込み先」を保守し続けることになる
// 古いタブから 7月以前が飛んできた場合は 400 で明示的に断る（黙って旧DBに書かない）。
//
// 構造化ログ（旧 service_action_logs_home）は sub2 に相当テーブルを作らない判断のため
// 受け取っても保存しない（2026-08-02 奥原判断・後日対応）。

type SaveHomeRecordRequestBody = {
  recordUuid: string;
  serviceDate: string;
  finalNote: string;
  memo: string | null;
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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function parseSaveHomeRecordBody(
  body: unknown,
): SaveHomeRecordRequestBody | null {
  if (!isObject(body)) {
    return null;
  }

  // フロントは record_uuid を scheduleTaskId という名前で送ってくる。
  // 名前を変えるとフロントの改修が要るので、受け口の名前は据え置く。
  const recordUuid = normalizeText(body.scheduleTaskId);
  const serviceDate = normalizeText(body.serviceDate);
  const finalNote = normalizeText(body.finalNote);

  if (!recordUuid || !serviceDate || !finalNote) {
    return null;
  }

  // body.task は受け取っても捨てる。予定側（GAS 転送）が入れた原文を残すため。
  // 古いタブが task を送ってきても無視される。
  return {
    recordUuid,
    serviceDate,
    finalNote,
    memo: normalizeText(body.memo),
  };
}

export async function handleSaveHomeRecord(
  req: Request,
  res: Response<SaveHomeRecordSuccessResponse | SaveHomeRecordErrorResponse>,
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
      message: "保存に必要な情報が足りません。予定を選び直してください。",
    });
    return;
  }

  if (!isSub2Date(parsedBody.serviceDate)) {
    res.status(400).json({
      ok: false,
      message:
        "2026年7月以前の記録はこの画面から保存できません。事業所にご連絡ください。",
    });
    return;
  }

  try {
    const outcome = await saveSub2HomeRecord(parsedBody.recordUuid, {
      final_note: parsedBody.finalNote,
      memo: parsedBody.memo,
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
      recordId: parsedBody.recordUuid,
      scheduleTaskId: parsedBody.recordUuid,
      status: "written",
    });
  } catch (error) {
    console.error("[service-records-home/save] error:", error);
    res.status(500).json({
      ok: false,
      message: "保存に失敗しました。時間をおいて再試行してください。",
    });
  }
}
