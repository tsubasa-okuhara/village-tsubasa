"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsStructuredSave = handleServiceRecordsStructuredSave;
const supabase_1 = require("../lib/supabase");
const catalog_1 = require("./catalog");
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalizedValue = value.trim();
    return normalizedValue === "" ? null : normalizedValue;
}
function normalizeRequiredString(value) {
    return normalizeOptionalString(value);
}
function normalizeOptionalNumber(value) {
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
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
}
function parseAction(input) {
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
function parseIrregularEvent(input) {
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
function parseRequestBody(body) {
    if (!isObject(body)) {
        return null;
    }
    const sourceType = normalizeRequiredString(body.sourceType);
    const sourceNoteId = normalizeRequiredString(body.sourceNoteId);
    if (!sourceType || !sourceNoteId) {
        return null;
    }
    const actions = Array.isArray(body.actions)
        ? body.actions.map(parseAction).filter((item) => item !== null)
        : [];
    const irregularEvents = Array.isArray(body.irregularEvents)
        ? body.irregularEvents
            .map(parseIrregularEvent)
            .filter((item) => item !== null)
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
function validateRequestBody(body) {
    if (body.sourceType !== catalog_1.SOURCE_TYPE_MOVE) {
        return "sourceType must be move";
    }
    if (body.physicalState && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.physicalStates, body.physicalState)) {
        return "invalid physicalState";
    }
    if (body.mentalState && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.mentalStates, body.mentalState)) {
        return "invalid mentalState";
    }
    if (!(0, catalog_1.areAllowedValues)(catalog_1.STRUCTURED_OPTIONS.riskFlags, body.riskFlags)) {
        return "invalid riskFlags";
    }
    if (body.actionResult && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.actionResults, body.actionResult)) {
        return "invalid actionResult";
    }
    if (body.difficulty && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.difficulties, body.difficulty)) {
        return "invalid difficulty";
    }
    if (body.assistLevel && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.assistLevels, body.assistLevel)) {
        return "invalid assistLevel";
    }
    if (body.location && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.locations, body.location)) {
        return "invalid location";
    }
    if (body.timeOfDay && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.timeOfDay, body.timeOfDay)) {
        return "invalid timeOfDay";
    }
    for (const action of body.actions) {
        if (!(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.actionTypes, action.actionType)) {
            return "invalid actionType";
        }
        if (action.actionDetail) {
            const allowedActionDetails = (0, catalog_1.getAllowedActionDetails)(action.actionType);
            if (!(0, catalog_1.isAllowedValue)(allowedActionDetails, action.actionDetail)) {
                return "invalid actionDetail";
            }
        }
        if (!(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.actors, action.actor)) {
            return "invalid actor";
        }
        if (!(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.targets, action.target)) {
            return "invalid target";
        }
        if (action.actionResult && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.actionResults, action.actionResult)) {
            return "invalid action actionResult";
        }
        if (action.difficulty && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.difficulties, action.difficulty)) {
            return "invalid action difficulty";
        }
        if (action.assistLevel && !(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.assistLevels, action.assistLevel)) {
            return "invalid action assistLevel";
        }
    }
    for (const event of body.irregularEvents) {
        if (!(0, catalog_1.isAllowedValue)(catalog_1.STRUCTURED_OPTIONS.eventTypes, event.eventType)) {
            return "invalid eventType";
        }
    }
    return null;
}
async function handleServiceRecordsStructuredSave(req, res) {
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
        const supabase = (0, supabase_1.getSupabaseClient)();
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
            .upsert({
            ...structuredPayload,
            created_at: timestamp,
        }, {
            onConflict: "source_type,source_note_id",
        })
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
    }
    catch (error) {
        console.error("[service-records-structured/save] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to save structured record",
        });
    }
}
