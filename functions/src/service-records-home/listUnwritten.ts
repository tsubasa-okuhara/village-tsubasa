import type { Request, Response } from "express";

import { RECORD_LIST_CUTOFF_DATE } from "../lib/recordCutoff";
import {
  fetchSub2UnwrittenHomeRecords,
  toUnwrittenHomeItem,
  type UnwrittenHomeItem,
} from "../lib/serviceRecordsSub2";

// 未記入一覧の取得元は sub2 の service_records_home。
//
// 旧DB の home_schedule_tasks（status='unwritten'）は見ない。理由は2つ:
//   1. 一覧の下限が RECORD_LIST_CUTOFF_DATE = 2026-08-01 で、これは sub2 の
//      データ境界（scheduleSource.ts の getCutoverStartDate()）と同じ日。
//      つまり一覧に出る範囲は全部 sub2 の担当。
//   2. 旧DB の home_schedule_tasks は 2026-08-01 以降 0 件（実測）。
// 旧DB を併読しても常に 0 件が返るだけなので、経路ごと落として単純にしてある。
//
// 未記入の判定は status 列ではなく「final_note が空かどうか」。
// GAS が本文の空な行を先に作り、アプリが UPDATE で埋める設計のため。

type ListUnwrittenHomeSuccessResponse = {
  ok: true;
  items: UnwrittenHomeItem[];
};

type ListUnwrittenHomeErrorResponse = {
  ok: false;
  message: string;
};

function getHelperEmailFilter(req: Request): string | null {
  const helperEmailValue = Array.isArray(req.query.helper_email)
    ? req.query.helper_email[0]
    : req.query.helper_email;

  if (typeof helperEmailValue !== "string") {
    return null;
  }

  const trimmedHelperEmail = helperEmailValue.trim();
  return trimmedHelperEmail === "" ? null : trimmedHelperEmail;
}

export async function handleListUnwrittenHome(
  req: Request,
  res: Response<ListUnwrittenHomeSuccessResponse | ListUnwrittenHomeErrorResponse>
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  try {
    const helperEmailFilter = getHelperEmailFilter(req);

    // 7/31 以前の未記入は事業所側で精査するためヘルパーには出さない
    const rows = await fetchSub2UnwrittenHomeRecords(
      helperEmailFilter,
      RECORD_LIST_CUTOFF_DATE,
    );

    res.status(200).json({
      ok: true,
      items: rows.map(toUnwrittenHomeItem),
    });
  } catch (error) {
    console.error("[service-records-home/unwritten] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
