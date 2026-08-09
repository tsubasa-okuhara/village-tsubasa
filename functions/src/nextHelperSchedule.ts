import type { Request, Response } from "express";

import {
  fetchSub2HelperNamesByEmail,
  fetchSub2NextEntryAfterDate,
  fetchSub2NextEntryOnDate,
  formatClockTime,
  getCutoverStartDate,
  isSub2Date,
  type Sub2EntryRow,
} from "./lib/scheduleSource";
import { getSupabaseClient } from "./lib/supabase";
import { getDateJstByOffset } from "./helperSummary";

type NextHelperScheduleItem = {
  id: string | number;
  date: string;
  helperName: string | null;
  helperEmail: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  task: string | null;
};

type NextHelperScheduleSuccessResponse = {
  ok: true;
  helperEmail: string;
  item: NextHelperScheduleItem | null;
};

type NextHelperScheduleErrorResponse = {
  ok: false;
  message: string;
};

type NextScheduleRow = {
  id: string | number;
  date: string;
  name: string | null;
  helper_email: string | null;
  client: string | null;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
};

function getCurrentJstTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function mapScheduleRow(row: NextScheduleRow): NextHelperScheduleItem {
  return {
    id: row.id,
    date: row.date,
    helperName: row.name,
    helperEmail: row.helper_email,
    userName: row.client,
    startTime: row.start_time,
    endTime: row.end_time,
    task: row.task,
  };
}

/**
 * sub2 の予定 → レスポンス形状。
 * helperEmail は schedule_entries に無いので、検索に使ったメールをそのまま返す。
 * task は support_flow、時刻は "HH:MM" に整形（ゼロ詰め維持）。
 */
function mapSub2Row(row: Sub2EntryRow, helperEmail: string): NextHelperScheduleItem {
  return {
    id: row.id,
    date: row.date,
    helperName: row.helper_name,
    helperEmail,
    userName: row.user_name,
    startTime: formatClockTime(row.start_time),
    endTime: formatClockTime(row.end_time),
    task: row.support_flow,
  };
}

async function fetchUpcomingScheduleOnDate(
  helperEmail: string,
  date: string,
  currentTime: string
): Promise<NextHelperScheduleItem | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, task")
    .ilike("helper_email", helperEmail)
    .eq("date", date)
    .gte("start_time", currentTime)
    .order("start_time", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = ((data ?? [])[0] ?? null) as NextScheduleRow | null;
  return row ? mapScheduleRow(row) : null;
}

async function fetchFutureSchedule(
  helperEmail: string,
  date: string
): Promise<NextHelperScheduleItem | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule_web_v")
    .select("id, date, name, helper_email, client, start_time, end_time, task")
    .ilike("helper_email", helperEmail)
    .gt("date", date)
    // 境界以降は sub2 の担当。旧DBに8月以降の行が残っていても拾わない
    .lt("date", getCutoverStartDate())
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = ((data ?? [])[0] ?? null) as NextScheduleRow | null;
  return row ? mapScheduleRow(row) : null;
}

export async function handleNextHelperSchedule(
  req: Request,
  res: Response<NextHelperScheduleSuccessResponse | NextHelperScheduleErrorResponse>
): Promise<void> {
  const helperEmailValue = Array.isArray(req.query.helper_email)
    ? req.query.helper_email[0]
    : req.query.helper_email;
  const helperEmail = String(helperEmailValue ?? "").trim();

  if (helperEmail === "") {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  try {
    const targetDate = getDateJstByOffset(0);
    const currentTime = getCurrentJstTime();

    // 「今日」と「その先」でデータソースが変わりうる（境界跨ぎ）。
    // 今日が境界以降なら全部 sub2、今日が境界より前なら
    // 今日〜7/31 は旧DB → 見つからなければ 8/1 以降を sub2 で探す。
    if (isSub2Date(targetDate)) {
      const helperNames = await fetchSub2HelperNamesByEmail(helperEmail);

      if (helperNames.length === 0) {
        console.warn(
          `[next-helper-schedule] sub2 の helper にこのメールの登録がありません: ${helperEmail}`,
        );
        res.status(200).json({ ok: true, helperEmail, item: null });
        return;
      }

      const todayRow = await fetchSub2NextEntryOnDate(helperNames, targetDate, currentTime);

      if (todayRow) {
        res.status(200).json({
          ok: true,
          helperEmail,
          item: mapSub2Row(todayRow, helperEmail),
        });
        return;
      }

      const futureRow = await fetchSub2NextEntryAfterDate(helperNames, targetDate);
      res.status(200).json({
        ok: true,
        helperEmail,
        item: futureRow ? mapSub2Row(futureRow, helperEmail) : null,
      });
      return;
    }

    const todayItem = await fetchUpcomingScheduleOnDate(
      helperEmail,
      targetDate,
      currentTime
    );

    if (todayItem) {
      res.status(200).json({
        ok: true,
        helperEmail,
        item: todayItem,
      });
      return;
    }

    const futureItem = await fetchFutureSchedule(helperEmail, targetDate);

    if (futureItem) {
      res.status(200).json({
        ok: true,
        helperEmail,
        item: futureItem,
      });
      return;
    }

    // 旧DB側（境界より前）に予定が無いので、境界以降を sub2 で探す
    const helperNames = await fetchSub2HelperNamesByEmail(helperEmail);
    const sub2Row = await fetchSub2NextEntryAfterDate(helperNames, targetDate);

    res.status(200).json({
      ok: true,
      helperEmail,
      item: sub2Row ? mapSub2Row(sub2Row, helperEmail) : null,
    });
  } catch (error) {
    console.error("[next-helper-schedule] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
