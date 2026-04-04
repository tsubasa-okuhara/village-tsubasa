"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsStructuredDetail = handleServiceRecordsStructuredDetail;
const supabase_1 = require("../lib/supabase");
const catalog_1 = require("./catalog");
async function handleServiceRecordsStructuredDetail(req, res) {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
        res.status(400).json({
            ok: false,
            message: "id is required",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: structuredRecord, error: structuredRecordError } = await supabase
            .from("service_record_structured")
            .select("*")
            .eq("id", id)
            .eq("source_type", catalog_1.SOURCE_TYPE_MOVE)
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
                structuredRecord: structuredRecord,
                actionLogs: (actionLogs ?? []),
                irregularEvents: (irregularEvents ?? []),
            },
        });
    }
    catch (error) {
        console.error("[service-records-structured/detail] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch structured record detail",
        });
    }
}
