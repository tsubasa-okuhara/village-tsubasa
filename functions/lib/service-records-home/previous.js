"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePreviousHome = handlePreviousHome;
const supabase_1 = require("../lib/supabase");
function getStr(value) {
    const v = Array.isArray(value) ? value[0] : value;
    return typeof v === "string" ? v.trim() : "";
}
async function handlePreviousHome(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ ok: false, message: "method not allowed" });
        return;
    }
    const userName = getStr(req.query.user_name);
    const before = getStr(req.query.before);
    if (!userName) {
        res.status(400).json({ ok: false, message: "user_name is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("home_schedule_tasks")
            .select("service_date, start_time, end_time, task, summary")
            .eq("user_name", userName)
            .eq("status", "written")
            .is("deleted_at", null)
            .not("summary", "is", null)
            .order("service_date", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1);
        if (before) {
            query = query.lt("service_date", before);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        const item = data && data.length > 0 ? data[0] : null;
        res.status(200).json({ ok: true, item });
    }
    catch (error) {
        console.error("[service-records-home/previous] error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
