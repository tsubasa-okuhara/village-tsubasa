import type { Request, Response } from "express";
import { getSupabaseClient } from "./lib/supabase";

type ScheduleSyncMode = "move" | "home" | "all";

type ScheduleSyncSuccessResponse = {
  ok: true;
  mode: ScheduleSyncMode;
  message: string;
  count?: number;
};

type ScheduleSyncErrorResponse = {
  ok: false;
  message: string;
};

function isScheduleSyncMode(value: unknown): value is ScheduleSyncMode {
  return value === "move" || value === "home" || value === "all";
}

function hasValidRequestBody(
  value: unknown
): value is { mode?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runMoveScheduleSync(): Promise<ScheduleSyncSuccessResponse> {
  console.log("[schedule-sync] move fetch start");
  console.log("[schedule-sync] run move");

  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("schedule")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  const fetchedCount = count ?? 0;
  console.log("[schedule-sync] move fetched count:", fetchedCount);

  return {
    ok: true,
    mode: "move",
    message: "move sync handler reached",
    count: fetchedCount,
  };
}

export async function runHomeScheduleSync(): Promise<ScheduleSyncSuccessResponse> {
  console.log("[schedule-sync] run home");

  return {
    ok: true,
    mode: "home",
    message: "home sync handler reached",
  };
}

export async function runAllScheduleSync(): Promise<ScheduleSyncSuccessResponse> {
  console.log("[schedule-sync] run all");
  await runMoveScheduleSync();
  await runHomeScheduleSync();

  return {
    ok: true,
    mode: "all",
    message: "all sync handler reached",
  };
}

export async function handleScheduleSync(
  req: Request,
  res: Response<ScheduleSyncSuccessResponse | ScheduleSyncErrorResponse>
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  if (!hasValidRequestBody(req.body)) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  const { mode } = req.body;

  console.log("[schedule-sync] mode:", mode);

  if (!isScheduleSyncMode(mode)) {
    res.status(400).json({
      ok: false,
      message: "invalid mode",
    });
    return;
  }

  try {
    let result: ScheduleSyncSuccessResponse;

    switch (mode) {
      case "move":
        result = await runMoveScheduleSync();
        break;
      case "home":
        result = await runHomeScheduleSync();
        break;
      case "all":
        result = await runAllScheduleSync();
        break;
      default:
        res.status(400).json({
          ok: false,
          message: "invalid mode",
        });
        return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("[schedule-sync] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
