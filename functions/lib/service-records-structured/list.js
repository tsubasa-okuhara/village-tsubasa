"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsStructuredList = handleServiceRecordsStructuredList;
const supabase_1 = require("../lib/supabase");
const catalog_1 = require("./catalog");
function getQueryValue(value) {
    if (Array.isArray(value)) {
        return String(value[0] ?? "").trim();
    }
    return String(value ?? "").trim();
}
async function handleServiceRecordsStructuredList(req, res) {
    const userName = getQueryValue(req.query.user_name);
    const helperEmail = getQueryValue(req.query.helper_email);
    const serviceDate = getQueryValue(req.query.service_date);
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("service_record_structured")
            .select("id, source_type, source_note_id, schedule_task_id, helper_email, helper_name, user_name, service_date, physical_state, mental_state, assist_level, action_result, difficulty, location, created_at")
            .eq("source_type", catalog_1.SOURCE_TYPE_MOVE)
            .order("created_at", { ascending: false });
        if (userName) {
            query = query.ilike("user_name", `%${userName}%`);
        }
        if (helperEmail) {
            query = query.eq("helper_email", helperEmail);
        }
        if (serviceDate) {
            query = query.eq("service_date", serviceDate);
        }
        const { data: headers, error: headersError } = await query;
        if (headersError) {
            throw headersError;
        }
        const headerRows = (headers ?? []);
        const structuredRecordIds = headerRows
            .map((row) => String(row.id ?? "").trim())
            .filter((id) => id.length > 0);
        const firstActionTypeMap = new Map();
        if (structuredRecordIds.length > 0) {
            const { data: actionRows, error: actionRowsError } = await supabase
                .from("service_action_logs")
                .select("structured_record_id, action_type, created_at")
                .in("structured_record_id", structuredRecordIds)
                .order("created_at", { ascending: true });
            if (actionRowsError) {
                throw actionRowsError;
            }
            for (const row of (actionRows ?? [])) {
                const structuredRecordId = String(row.structured_record_id ?? "").trim();
                if (!structuredRecordId || firstActionTypeMap.has(structuredRecordId)) {
                    continue;
                }
                firstActionTypeMap.set(structuredRecordId, row.action_type ?? null);
            }
        }
        const items = headerRows.map((row) => ({
            id: String(row.id ?? ""),
            sourceType: String(row.source_type ?? ""),
            sourceNoteId: row.source_note_id ?? null,
            scheduleTaskId: row.schedule_task_id ?? null,
            helperEmail: row.helper_email ?? null,
            helperName: row.helper_name ?? null,
            userName: row.user_name ?? null,
            serviceDate: row.service_date ?? null,
            physicalState: row.physical_state ?? null,
            mentalState: row.mental_state ?? null,
            assistLevel: row.assist_level ?? null,
            actionResult: row.action_result ?? null,
            difficulty: row.difficulty ?? null,
            location: row.location ?? null,
            actionType: firstActionTypeMap.get(String(row.id ?? "")) ?? null,
            createdAt: row.created_at ?? null,
        }));
        res.status(200).json({
            ok: true,
            items,
        });
    }
    catch (error) {
        console.error("[service-records-structured/list] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch structured record list",
        });
    }
}
