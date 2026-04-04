"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleNextHelperSchedule = handleNextHelperSchedule;
const supabase_1 = require("./lib/supabase");
const helperSummary_1 = require("./helperSummary");
function getCurrentJstTime() {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date());
}
function mapScheduleRow(row) {
    return {
        id: row.id,
        date: row.date,
        helperName: row.name,
        helperEmail: row.helper_email,
        userName: row.client,
        startTime: row.start_time,
        endTime: row.end_time,
        task: row.task,
    };
}
async function fetchUpcomingScheduleOnDate(helperEmail, date, currentTime) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, task")
        .ilike("helper_email", helperEmail)
        .eq("date", date)
        .gte("start_time", currentTime)
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    const row = ((data ?? [])[0] ?? null);
    return row ? mapScheduleRow(row) : null;
}
async function fetchFutureSchedule(helperEmail, date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, task")
        .ilike("helper_email", helperEmail)
        .gt("date", date)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    const row = ((data ?? [])[0] ?? null);
    return row ? mapScheduleRow(row) : null;
}
async function handleNextHelperSchedule(req, res) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    const helperEmail = String(helperEmailValue ?? "").trim();
    if (helperEmail === "") {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const targetDate = (0, helperSummary_1.getDateJstByOffset)(0);
        const currentTime = getCurrentJstTime();
        const todayItem = await fetchUpcomingScheduleOnDate(helperEmail, targetDate, currentTime);
        if (todayItem) {
            res.status(200).json({
                ok: true,
                helperEmail,
                item: todayItem,
            });
            return;
        }
        const futureItem = await fetchFutureSchedule(helperEmail, targetDate);
        res.status(200).json({
            ok: true,
            helperEmail,
            item: futureItem,
        });
    }
    catch (error) {
        console.error("[next-helper-schedule] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
