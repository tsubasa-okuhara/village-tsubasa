"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchScheduleAllByDate = fetchScheduleAllByDate;
exports.createScheduleAllHandler = createScheduleAllHandler;
const helperSummary_1 = require("./helperSummary");
const supabase_1 = require("./lib/supabase");
async function fetchScheduleAllByDate(date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule")
        .select("id, date, name, client, start_time, end_time, haisha, task, summary")
        .eq("date", date)
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
function createScheduleAllHandler(dayOffset, logLabel) {
    return async function handleScheduleAll(_req, res) {
        try {
            const targetDate = (0, helperSummary_1.getDateJstByOffset)(dayOffset);
            const items = await fetchScheduleAllByDate(targetDate);
            res.status(200).json({
                ok: true,
                date: targetDate,
                count: items.length,
                items,
            });
        }
        catch (error) {
            console.error(`[${logLabel}] error:`, error);
            res.status(500).json({
                ok: false,
                message: "internal error",
            });
        }
    };
}
