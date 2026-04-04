import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import { SOURCE_TYPE_MOVE } from "./catalog";

type StructuredDetailSuccessResponse = {
  ok: true;
  item: {
    structuredRecord: Record<string, unknown>;
    actionLogs: Record<string, unknown>[];
    irregularEvents: Record<string, unknown>[];
  } | null;
};

type StructuredDetailErrorResponse = {
  ok: false;
  message: string;
};

export async function handleServiceRecordsStructuredDetail(
  req: Request,
  res: Response<StructuredDetailSuccessResponse | StructuredDetailErrorResponse>,
): Promise<void> {
  const id = String(req.params.id ?? "").trim();

  if (!id) {
    res.status(400).json({
      ok: false,
      message: "id is required",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data: structuredRecord, error: structuredRecordError } = await supabase
      .from("service_record_structured")
      .select("*")
      .eq("id", id)
      .eq("source_type", SOURCE_TYPE_MOVE)
      .maybeSingle();

    if (structuredRecordError) {
      throw structuredRecordError;
    }

    if (!structuredRecord) {
      res.status(200).json({
        ok: true,
        item: null,
      });
      return;
    }

    const { data: actionLogs, error: actionLogsError } = await supabase
      .from("service_action_logs")
      .select("*")
      .eq("structured_record_id", id)
      .order("created_at", { ascending: true });

    if (actionLogsError) {
      throw actionLogsError;
    }

    const { data: irregularEvents, error: irregularEventsError } = await supabase
      .from("service_irregular_events")
      .select("*")
      .eq("structured_record_id", id)
      .order("created_at", { ascending: true });

    if (irregularEventsError) {
      throw irregularEventsError;
    }

    res.status(200).json({
      ok: true,
      item: {
        structuredRecord: structuredRecord as Record<string, unknown>,
        actionLogs: (actionLogs ?? []) as Record<string, unknown>[],
        irregularEvents: (irregularEvents ?? []) as Record<string, unknown>[],
      },
    });
  } catch (error) {
    console.error("[service-records-structured/detail] error:", error);
    res.status(500).json({
      ok: false,
      message: "failed to fetch structured record detail",
    });
  }
}
