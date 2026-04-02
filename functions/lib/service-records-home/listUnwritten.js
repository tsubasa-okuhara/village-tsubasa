"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListUnwrittenHome = handleListUnwrittenHome;
const supabase_1 = require("../lib/supabase");
function getHelperEmailFilter(req) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    if (typeof helperEmailValue !== "string") {
        return null;
    }
    const trimmedHelperEmail = helperEmailValue.trim();
    return trimmedHelperEmail === "" ? null : trimmedHelperEmail;
}
async function handleListUnwrittenHome(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({
            ok: false,
            message: "method not allowed",
        });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const helperEmailFilter = getHelperEmailFilter(req);
        let query = supabase
            .from("home_schedule_tasks")
            .select("id, schedule_id, service_date, helper_name, helper_email, user_name, start_time, end_time, task, summary, beneficiary_number, status")
            .eq("status", "unwritten")
            .order("service_date", { ascending: true })
            .order("start_time", { ascending: true, nullsFirst: true })
            .order("helper_name", { ascending: true });
        if (helperEmailFilter) {
            query = query.ilike("helper_email", helperEmailFilter);
        }
        const { data, error } = await query;
        if (error) {
            throw error;
        }
        res.status(200).json({
            ok: true,
            items: (data ?? []),
        });
    }
    catch (error) {
        console.error("[service-records-home/unwritten] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
