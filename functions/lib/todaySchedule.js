"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayDateJst = getTodayDateJst;
exports.fetchTodayScheduleByHelperEmail = fetchTodayScheduleByHelperEmail;
exports.handleTodaySchedule = handleTodaySchedule;
const supabase_1 = require("./lib/supabase");
function getTodayDateJst() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(new Date());
}
async function fetchTodayScheduleByHelperEmail(helperEmail, date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, haisha, task, summary")
        .eq("date", date)
        .ilike("helper_email", helperEmail)
        .order("start_time", { ascending: true });
    if (error) {
        throw error;
    }
    const rows = (data ?? []);
    return rows.map(function (row) {
        return {
            id: row.id,
            helperName: row.name,
            userName: row.client,
            startTime: row.start_time,
            endTime: row.end_time,
            haisha: row.haisha,
            task: row.task,
            summary: row.summary,
        };
    });
}
async function handleTodaySchedule(req, res) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    const helperEmail = typeof helperEmailValue === "string" ? helperEmailValue.trim() : "";
    if (helperEmail === "") {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const todayDate = getTodayDateJst();
        const items = await fetchTodayScheduleByHelperEmail(helperEmail, todayDate);
        res.status(200).json({
            ok: true,
            date: todayDate,
            helperEmail: helperEmail,
            count: items.length,
            items: items,
        });
    }
    catch (error) {
        console.error("[today-schedule] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
