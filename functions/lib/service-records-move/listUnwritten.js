"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsMoveListUnwritten = handleServiceRecordsMoveListUnwritten;
const supabase_1 = require("../lib/supabase");
function getQueryValue(value) {
    if (Array.isArray(value)) {
        return String(value[0] ?? "").trim();
    }
    return String(value ?? "").trim();
}
function toItem(row) {
    return {
        taskId: String(row.id ?? ""),
        helperEmail: String(row.helper_email ?? ""),
        serviceDate: String(row.service_date ?? ""),
        startTime: String(row.start_time ?? ""),
        endTime: String(row.end_time ?? ""),
        userName: String(row.user_name ?? ""),
        helperName: String(row.helper_name ?? ""),
        task: String(row.task ?? ""),
        summary: String(row.summary ?? ""),
        summaryText: String(row.summary_text ?? ""),
        beneficiaryNumber: String(row.beneficiary_number ?? ""),
        raw: row,
    };
}
async function handleServiceRecordsMoveListUnwritten(req, res) {
    const helperEmail = getQueryValue(req.query.helper_email);
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    console.log("[service-records-move/unwritten] request:", {
        helperEmail,
    });
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("schedule_tasks_move")
            .select(`
          id,
          helper_email,
          status,
          service_date,
          start_time,
          end_time,
          user_name,
          helper_name,
          task,
          summary,
          summary_text,
          beneficiary_number
        `)
            .ilike("helper_email", helperEmail)
            .eq("status", "unwritten")
            .order("service_date", { ascending: true })
            .order("start_time", { ascending: true });
        if (error) {
            console.error("[service-records-move/unwritten] query error:", error);
            throw error;
        }
        const items = (data ?? []).map(toItem);
        console.log("[service-records-move/unwritten] success:", {
            helperEmail,
            count: items.length,
        });
        res.status(200).json({
            ok: true,
            helperEmail,
            items,
        });
    }
    catch (error) {
        console.error("[service-records-move/unwritten] runtime error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch unwritten move tasks",
        });
    }
}
