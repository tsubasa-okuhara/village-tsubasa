import type { Request, Response } from "express";

import { RECORD_LIST_CUTOFF_DATE } from "../lib/recordCutoff";
import {
  fetchSub2UnwrittenMoveRecords,
  toUnwrittenMoveItem,
  type UnwrittenMoveItem,
} from "../lib/serviceRecordsSub2";

// 取得元は sub2 の service_records_move。
// 旧DB の schedule_tasks_move を見ない理由は居宅版と同じ（listUnwritten.ts 冒頭参照）。
// 未記入の判定は status 列ではなく「summary_text が空かどうか」。

type ListUnwrittenSuccessResponse = {
  ok: true;
  helperEmail: string;
  items: UnwrittenMoveItem[];
};

type ListUnwrittenErrorResponse = {
  ok: false;
  message: string;
};

function getQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
}

export async function handleServiceRecordsMoveListUnwritten(
  req: Request,
  res: Response<ListUnwrittenSuccessResponse | ListUnwrittenErrorResponse>,
): Promise<void> {
  const helperEmail = getQueryValue(req.query.helper_email);

  console.log("[service-records-move/unwritten] request:", {
    helperEmail,
  });

  try {
    // 7/31 以前の未記入は事業所側で精査するためヘルパーには出さない
    const rows = await fetchSub2UnwrittenMoveRecords(
      helperEmail || null,
      RECORD_LIST_CUTOFF_DATE,
    );

    const items = rows.map(toUnwrittenMoveItem);

    console.log("[service-records-move/unwritten] success:", {
      helperEmail,
      count: items.length,
    });

    res.status(200).json({
      ok: true,
      helperEmail,
      items,
    });
  } catch (error) {
    console.error("[service-records-move/unwritten] runtime error:", error);
    res.status(500).json({
      ok: false,
      message: "failed to fetch unwritten move tasks",
    });
  }
}
