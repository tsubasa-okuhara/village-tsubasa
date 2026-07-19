"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsMovePrevious = handleServiceRecordsMovePrevious;
const supabase_1 = require("../lib/supabase");
function getQueryValue(value) {
    if (Array.isArray(value))
        return String(value[0] ?? "").trim();
    return String(value ?? "").trim();
}
async function handleServiceRecordsMovePrevious(req, res) {
    const userName = getQueryValue(req.query.user_name);
    const before = getQueryValue(req.query.before);
    if (!userName) {
        res.status(400).json({ ok: false, message: "user_name is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("schedule_tasks_move")
            .select("service_date, start_time, end_time, task, summary, summary_text")
            .eq("user_name", userName)
            .eq("status", "written")
            .order("service_date", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1);
        if (before) {
            query = query.lt("service_date", before);
        }
        const { data, error } = await query;
        if (error) {
            console.error("[service-records-move/previous] query error:", error);
            throw error;
        }
        const row = data && data.length > 0 ? data[0] : null;
        const item = row
            ? {
                service_date: row.service_date ?? "",
                start_time: row.start_time ?? "",
                end_time: row.end_time ?? "",
                task: row.task ?? "",
                summary: (row.summary_text ?? "").trim() || (row.summary ?? "").trim(),
            }
            : null;
        res.status(200).json({ ok: true, item });
    }
    catch (error) {
        console.error("[service-records-move/previous] runtime error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
