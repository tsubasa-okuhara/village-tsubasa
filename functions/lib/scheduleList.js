"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYearMonthParams = parseYearMonthParams;
exports.fetchScheduleListSub2 = fetchScheduleListSub2;
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
async function fetchScheduleListSub2(year, month) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const pageSize = 1000;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(year, month, 1);
    const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from("schedule_entries")
            .select("id, date, helper_name, user_name, start_time, end_time, transport, support_flow, helper_note, updated_at")
            .eq("is_published", true)
            .is("cancelled_at", null)
            .not("helper_name", "is", null)
            .neq("helper_name", "")
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
            helperName: row.helper_name,
            userName: row.user_name,
            startTime: row.start_time,
            endTime: row.end_time,
            haisha: row.transport,
            task: row.support_flow,
            summary: row.helper_note,
            updatedAt: row.updated_at,
        };
    });
}
async function fetchScheduleList(year, month) {
    // これは一時的な移行処理ではなく恒久的なデータ境界。
    // 2026年7月以前 = 旧DB(schedule_web_v) / 2026年8月以降 = sub2(schedule_entries)。
    // 過去データ参照のため、この分岐を削除すると7月以前が表示されなくなる。
    const CUTOVER_YEAR = Number(process.env.CUTOVER_YEAR ?? 2026);
    const CUTOVER_MONTH = Number(process.env.CUTOVER_MONTH ?? 8);
    if (year > CUTOVER_YEAR || (year === CUTOVER_YEAR && month >= CUTOVER_MONTH)) {
        return fetchScheduleListSub2(year, month);
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
    const pageSize = 1000;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(year, month, 1);
    const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from("schedule_web_v")
            .select("id, date, name, client, start_time, end_time, haisha, task, summary, updated_at")
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
            updatedAt: row.updated_at,
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
