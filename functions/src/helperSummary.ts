import type { Request, Response } from "express";

import { getSupabaseClient } from "./lib/supabase";

export type HelperSummaryItem = {
  helperName: string | null;
  helperEmail: string;
  scheduleCount: number;
  firstStartTime: string | null;
  scheduleUrl: string;
};

export type HelperSummarySuccessResponse = {
  ok: true;
  date: string;
  count: number;
  helpers: HelperSummaryItem[];
};

export type HelperSummaryErrorResponse = {
  ok: false;
  message: string;
};

type ScheduleRow = {
  date: string;
  name: string | null;
  helper_email: string;
  start_time: string | null;
};

type HelperAccumulator = {
  helperName: string | null;
  helperEmail: string;
  scheduleCount: number;
  firstStartTime: string | null;
};

function getJstDateParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(function (part) {
    return part.type === "year";
  })?.value);
  const month = Number(parts.find(function (part) {
    return part.type === "month";
  })?.value);
  const day = Number(parts.find(function (part) {
    return part.type === "day";
  })?.value);

  return { year, month, day };
}

export function getDateJstByOffset(dayOffset: number): string {
  const { year, month, day } = getJstDateParts(new Date());
  const targetDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(targetDate);
}

function buildScheduleUrl(helperEmail: string): string {
  const query = new URLSearchParams({
    helper_email: helperEmail,
  });

  return `/today-schedule/?${query.toString()}`;
}

function compareStartTime(a: string | null, b: string | null): number {
  if (!a && !b) {
    return 0;
  }

  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
  }

  return a.localeCompare(b);
}

export async function fetchHelperSummaryByDate(date: string): Promise<HelperSummaryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("schedule")
    .select("date, name, helper_email, start_time")
    .eq("date", date)
    .not("helper_email", "is", null)
    .neq("helper_email", "")
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ScheduleRow[];
  const helperMap = new Map<string, HelperAccumulator>();

  for (const row of rows) {
    const helperEmail = row.helper_email.trim();

    if (helperEmail === "") {
      continue;
    }

    const existing = helperMap.get(helperEmail);

    if (!existing) {
      helperMap.set(helperEmail, {
        helperName: row.name,
        helperEmail,
        scheduleCount: 1,
        firstStartTime: row.start_time,
      });
      continue;
    }

    existing.scheduleCount += 1;

    if (!existing.helperName && row.name) {
      existing.helperName = row.name;
    }

    if (compareStartTime(row.start_time, existing.firstStartTime) < 0) {
      existing.firstStartTime = row.start_time;
    }
  }

  return Array.from(helperMap.values())
    .sort(function (a, b) {
      const timeOrder = compareStartTime(a.firstStartTime, b.firstStartTime);

      if (timeOrder !== 0) {
        return timeOrder;
      }

      return a.helperEmail.localeCompare(b.helperEmail);
    })
    .map(function (helper) {
      return {
        helperName: helper.helperName,
        helperEmail: helper.helperEmail,
        scheduleCount: helper.scheduleCount,
        firstStartTime: helper.firstStartTime,
        scheduleUrl: buildScheduleUrl(helper.helperEmail),
      };
    });
}

export function createHelperSummaryHandler(dayOffset: number, logLabel: string) {
  return async function handleHelperSummary(
    _req: Request,
    res: Response<HelperSummarySuccessResponse | HelperSummaryErrorResponse>
  ): Promise<void> {
    try {
      const targetDate = getDateJstByOffset(dayOffset);
      const helpers = await fetchHelperSummaryByDate(targetDate);

      res.status(200).json({
        ok: true,
        date: targetDate,
        count: helpers.length,
        helpers,
      });
    } catch (error) {
      console.error(`[${logLabel}] error:`, error);
      res.status(500).json({
        ok: false,
        message: "internal error",
      });
    }
  };
}
