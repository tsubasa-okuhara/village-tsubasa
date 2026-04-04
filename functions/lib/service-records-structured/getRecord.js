"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsStructuredGet = handleServiceRecordsStructuredGet;
const supabase_1 = require("../lib/supabase");
const catalog_1 = require("./catalog");
async function handleServiceRecordsStructuredGet(req, res) {
    const sourceNoteId = String(req.params.sourceNoteId ?? "").trim();
    if (!sourceNoteId) {
        res.status(400).json({
            ok: false,
            message: "sourceNoteId is required",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: header, error: headerError } = await supabase
            .from("service_record_structured")
            .select("*")
            .eq("source_type", catalog_1.SOURCE_TYPE_MOVE)
            .eq("source_note_id", sourceNoteId)
            .maybeSingle();
        if (headerError) {
            throw headerError;
        }
        if (!header) {
            res.status(200).json({
                ok: true,
                item: null,
            });
            return;
        }
        const structuredRecordId = String(header.id ?? "").trim();
        const { data: actions, error: actionsError } = await supabase
            .from("service_action_logs")
            .select("*")
            .eq("structured_record_id", structuredRecordId)
            .order("created_at", { ascending: true });
        if (actionsError) {
            throw actionsError;
        }
        const { data: irregularEvents, error: irregularEventsError } = await supabase
            .from("service_irregular_events")
            .select("*")
            .eq("structured_record_id", structuredRecordId)
            .order("created_at", { ascending: true });
        if (irregularEventsError) {
            throw irregularEventsError;
        }
        res.status(200).json({
            ok: true,
            item: {
                header,
                actions: (actions ?? []),
                irregularEvents: (irregularEvents ?? []),
            },
        });
    }
    catch (error) {
        console.error("[service-records-structured/get] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch structured record",
        });
    }
}
