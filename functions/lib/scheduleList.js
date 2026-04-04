"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYearMonthParams = parseYearMonthParams;
exports.fetchScheduleList = fetchScheduleList;
exports.handleScheduleList = handleScheduleList;
const supabase_1 = require("./lib/supabase");
function parseYearMonthParams(req) {
    const yearValue = Array.isArray(req.query.year) ? req.query.year[0] : req.query.year;
    const monthValue = Array.isArray(req.query.month) ? req.query.month[0] : req.query.month;
    const year = Number(yearValue);
    const month = Number(monthValue);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }
    return { year, month };
}
async function fetchScheduleList(year, month) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const pageSize = 1000;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(year, month, 1);
    const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from("schedule_web_v")
            .select("id, date, name, client, start_time, end_time, haisha, task, summary")
            .gte("date", startDate)
            .lt("date", endDate)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) {
            throw error;
        }
        const pageRows = (data ?? []);
        rows.push(...pageRows);
        if (pageRows.length < pageSize) {
            break;
        }
    }
    return rows.map(function (row) {
        return {
            id: row.id,
            date: row.date,
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
async function handleScheduleList(req, res) {
    const parsed = parseYearMonthParams(req);
    if (!parsed) {
        res.status(400).json({
            ok: false,
            message: "invalid year or month",
        });
        return;
    }
    try {
        const items = await fetchScheduleList(parsed.year, parsed.month);
        res.status(200).json({
            ok: true,
            year: parsed.year,
            month: parsed.month,
            items: items,
        });
    }
    catch (error) {
        console.error("[schedule-list] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
