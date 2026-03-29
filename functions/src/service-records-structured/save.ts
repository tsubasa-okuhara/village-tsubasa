import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import {
  areAllowedValues,
  getAllowedActionDetails,
  isAllowedValue,
  SOURCE_TYPE_MOVE,
  STRUCTURED_OPTIONS,
} from "./catalog";

type StructuredActionLogInput = {
  actionType: string;
  actionDetail: string | null;
  actionDetailOther: string | null;
  actor: string;
  target: string;
  startTime: string | null;
  endTime: string | null;
  duration: number | null;
  actionResult: string | null;
  difficulty: string | null;
  assistLevel: string | null;
};

type StructuredIrregularEventInput = {
  eventType: string;
  beforeState: string | null;
  afterAction: string | null;
};

type StructuredSaveRequestBody = {
  sourceType: string;
  sourceNoteId: string;
  scheduleTaskId: string | null;
  helperEmail: string | null;
  helperName: string | null;
  userName: string | null;
  serviceDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  locationNote: string | null;
  timeOfDay: string | null;
  temperature: number | null;
  physicalState: string | null;
  mentalState: string | null;
  riskFlags: string[];
  actionResult: string | null;
  difficulty: string | null;
  assistLevel: string | null;
  actions: StructuredActionLogInput[];
  irregularEvents: StructuredIrregularEventInput[];
};

type StructuredSaveSuccessResponse = {
  ok: true;
  structuredRecordId: string;
  sourceType: string;
  sourceNoteId: string;
};

type StructuredSaveErrorResponse = {
  ok: false;
  message: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function normalizeRequiredString(value: unknown): string | null {
  return normalizeOptionalString(value);
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return null;
    }

    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseAction(input: unknown): StructuredActionLogInput | null {
  if (!isObject(input)) {
    return null;
  }

  const actionType = normalizeRequiredString(input.actionType);
  const actionDetail = normalizeOptionalString(input.actionDetail);
  const actionDetailOther = normalizeOptionalString(input.actionDetailOther);
  const actor = normalizeRequiredString(input.actor);
  const target = normalizeRequiredString(input.target);
  const startTime = normalizeOptionalString(input.startTime);
  const endTime = normalizeOptionalString(input.endTime);
  const duration = normalizeOptionalNumber(input.duration);
  const actionResult = normalizeOptionalString(input.actionResult);
  const difficulty = normalizeOptionalString(input.difficulty);
  const assistLevel = normalizeOptionalString(input.assistLevel);

  if (!actionType || !actor || !target) {
    return null;
  }

  return {
    actionType,
    actionDetail,
    actionDetailOther,
    actor,
    target,
    startTime,
    endTime,
    duration,
    actionResult,
    difficulty,
    assistLevel,
  };
}

function parseIrregularEvent(input: unknown): StructuredIrregularEventInput | null {
  if (!isObject(input)) {
    return null;
  }

  const eventType = normalizeRequiredString(input.eventType);

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    beforeState: normalizeOptionalString(input.beforeState),
    afterAction: normalizeOptionalString(input.afterAction),
  };
}

function parseRequestBody(body: unknown): StructuredSaveRequestBody | null {
  if (!isObject(body)) {
    return null;
  }

  const sourceType = normalizeRequiredString(body.sourceType);
  const sourceNoteId = normalizeRequiredString(body.sourceNoteId);

  if (!sourceType || !sourceNoteId) {
    return null;
  }

  const actions = Array.isArray(body.actions)
    ? body.actions.map(parseAction).filter((item): item is StructuredActionLogInput => item !== null)
    : [];
  const irregularEvents = Array.isArray(body.irregularEvents)
    ? body.irregularEvents
        .map(parseIrregularEvent)
        .filter((item): item is StructuredIrregularEventInput => item !== null)
    : [];

  return {
    sourceType,
    sourceNoteId,
    scheduleTaskId: normalizeOptionalString(body.scheduleTaskId),
    helperEmail: normalizeOptionalString(body.helperEmail),
    helperName: normalizeOptionalString(body.helperName),
    userName: normalizeOptionalString(body.userName),
    serviceDate: normalizeOptionalString(body.serviceDate),
    startTime: normalizeOptionalString(body.startTime),
    endTime: normalizeOptionalString(body.endTime),
    location: normalizeOptionalString(body.location),
    locationNote: normalizeOptionalString(body.locationNote),
    timeOfDay: normalizeOptionalString(body.timeOfDay),
    temperature: normalizeOptionalNumber(body.temperature),
    physicalState: normalizeOptionalString(body.physicalState),
    mentalState: normalizeOptionalString(body.mentalState),
    riskFlags: normalizeStringArray(body.riskFlags),
    actionResult: normalizeOptionalString(body.actionResult),
    difficulty: normalizeOptionalString(body.difficulty),
    assistLevel: normalizeOptionalString(body.assistLevel),
    actions,
    irregularEvents,
  };
}

function validateRequestBody(body: StructuredSaveRequestBody): string | null {
  if (body.sourceType !== SOURCE_TYPE_MOVE) {
    return "sourceType must be move";
  }

  if (body.physicalState && !isAllowedValue(STRUCTURED_OPTIONS.physicalStates, body.physicalState)) {
    return "invalid physicalState";
  }

  if (body.mentalState && !isAllowedValue(STRUCTURED_OPTIONS.mentalStates, body.mentalState)) {
    return "invalid mentalState";
  }

  if (!areAllowedValues(STRUCTURED_OPTIONS.riskFlags, body.riskFlags)) {
    return "invalid riskFlags";
  }

  if (body.actionResult && !isAllowedValue(STRUCTURED_OPTIONS.actionResults, body.actionResult)) {
    return "invalid actionResult";
  }

  if (body.difficulty && !isAllowedValue(STRUCTURED_OPTIONS.difficulties, body.difficulty)) {
    return "invalid difficulty";
  }

  if (body.assistLevel && !isAllowedValue(STRUCTURED_OPTIONS.assistLevels, body.assistLevel)) {
    return "invalid assistLevel";
  }

  if (body.location && !isAllowedValue(STRUCTURED_OPTIONS.locations, body.location)) {
    return "invalid location";
  }

  if (body.timeOfDay && !isAllowedValue(STRUCTURED_OPTIONS.timeOfDay, body.timeOfDay)) {
    return "invalid timeOfDay";
  }

  for (const action of body.actions) {
    if (!isAllowedValue(STRUCTURED_OPTIONS.actionTypes, action.actionType)) {
      return "invalid actionType";
    }

    if (action.actionDetail) {
      const allowedActionDetails = getAllowedActionDetails(action.actionType);

      if (!isAllowedValue(allowedActionDetails, action.actionDetail)) {
        return "invalid actionDetail";
      }
    }

    if (!isAllowedValue(STRUCTURED_OPTIONS.actors, action.actor)) {
      return "invalid actor";
    }

    if (!isAllowedValue(STRUCTURED_OPTIONS.targets, action.target)) {
      return "invalid target";
    }

    if (action.actionResult && !isAllowedValue(STRUCTURED_OPTIONS.actionResults, action.actionResult)) {
      return "invalid action actionResult";
    }

    if (action.difficulty && !isAllowedValue(STRUCTURED_OPTIONS.difficulties, action.difficulty)) {
      return "invalid action difficulty";
    }

    if (action.assistLevel && !isAllowedValue(STRUCTURED_OPTIONS.assistLevels, action.assistLevel)) {
      return "invalid action assistLevel";
    }
  }

  for (const event of body.irregularEvents) {
    if (!isAllowedValue(STRUCTURED_OPTIONS.eventTypes, event.eventType)) {
      return "invalid eventType";
    }
  }

  return null;
}

export async function handleServiceRecordsStructuredSave(
  req: Request,
  res: Response<StructuredSaveSuccessResponse | StructuredSaveErrorResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      message: "method not allowed",
    });
    return;
  }

  const parsedBody = parseRequestBody(req.body);

  if (!parsedBody) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  const validationError = validateRequestBody(parsedBody);

  if (validationError) {
    res.status(400).json({
      ok: false,
      message: validationError,
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const timestamp = new Date().toISOString();

    const { data: noteRecord, error: noteError } = await supabase
      .from("service_notes_move")
      .select("id")
      .eq("id", parsedBody.sourceNoteId)
      .maybeSingle();

    if (noteError) {
      throw noteError;
    }

    if (!noteRecord) {
      res.status(404).json({
        ok: false,
        message: "source move note not found",
      });
      return;
    }

    const structuredPayload = {
      source_type: parsedBody.sourceType,
      source_note_id: parsedBody.sourceNoteId,
      schedule_task_id: parsedBody.scheduleTaskId,
      helper_email: parsedBody.helperEmail,
      helper_name: parsedBody.helperName,
      user_name: parsedBody.userName,
      service_date: parsedBody.serviceDate,
      start_time: parsedBody.startTime,
      end_time: parsedBody.endTime,
      location: parsedBody.location,
      location_note: parsedBody.locationNote,
      time_of_day: parsedBody.timeOfDay,
      temperature: parsedBody.temperature,
      physical_state: parsedBody.physicalState,
      mental_state: parsedBody.mentalState,
      risk_flags: parsedBody.riskFlags,
      action_result: parsedBody.actionResult,
      difficulty: parsedBody.difficulty,
      assist_level: parsedBody.assistLevel,
      updated_at: timestamp,
    };

    const { data: structuredRecord, error: structuredError } = await supabase
      .from("service_record_structured")
      .upsert(
        {
          ...structuredPayload,
          created_at: timestamp,
        },
        {
          onConflict: "source_type,source_note_id",
        },
      )
      .select("id")
      .single();

    if (structuredError) {
      throw structuredError;
    }

    const structuredRecordId = String(structuredRecord?.id ?? "").trim();

    if (!structuredRecordId) {
      throw new Error("failed to resolve structured record id");
    }

    const { error: deleteActionsError } = await supabase
      .from("service_action_logs")
      .delete()
      .eq("structured_record_id", structuredRecordId);

    if (deleteActionsError) {
      throw deleteActionsError;
    }

    if (parsedBody.actions.length > 0) {
      const actionRows = parsedBody.actions.map((action) => ({
        structured_record_id: structuredRecordId,
        action_type: action.actionType,
        action_detail: action.actionDetail,
        action_detail_other: action.actionDetailOther,
        actor: action.actor,
        target: action.target,
        start_time: action.startTime,
        end_time: action.endTime,
        duration: action.duration,
        action_result: action.actionResult,
        difficulty: action.difficulty,
        assist_level: action.assistLevel,
        created_at: timestamp,
      }));

      const { error: insertActionsError } = await supabase
        .from("service_action_logs")
        .insert(actionRows);

      if (insertActionsError) {
        throw insertActionsError;
      }
    }

    const { error: deleteEventsError } = await supabase
      .from("service_irregular_events")
      .delete()
      .eq("structured_record_id", structuredRecordId);

    if (deleteEventsError) {
      throw deleteEventsError;
    }

    if (parsedBody.irregularEvents.length > 0) {
      const irregularEventRows = parsedBody.irregularEvents.map((event) => ({
        structured_record_id: structuredRecordId,
        event_type: event.eventType,
        before_state: event.beforeState,
        after_action: event.afterAction,
        created_at: timestamp,
      }));

      const { error: insertEventsError } = await supabase
        .from("service_irregular_events")
        .insert(irregularEventRows);

      if (insertEventsError) {
        throw insertEventsError;
      }
    }

    res.status(200).json({
      ok: true,
      structuredRecordId,
      sourceType: parsedBody.sourceType,
      sourceNoteId: parsedBody.sourceNoteId,
    });
  } catch (error) {
    console.error("[service-records-structured/save] error:", error);
    res.status(500).json({
      ok: false,
      message: "failed to save structured record",
    });
  }
}
