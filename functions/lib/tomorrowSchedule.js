"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTomorrowScheduleByHelperEmail = fetchTomorrowScheduleByHelperEmail;
exports.fetchTomorrowScheduleItems = fetchTomorrowScheduleItems;
exports.handleTomorrowSchedule = handleTomorrowSchedule;
const helperSummary_1 = require("./helperSummary");
const scheduleSource_1 = require("./lib/scheduleSource");
const supabase_1 = require("./lib/supabase");
async function fetchTomorrowScheduleByHelperEmail(helperEmail, date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    // 当日の全レコードを取得（合同シフト判定のため、本人以外も含めて全件）
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, haisha, task, summary")
        .eq("date", date)
        .order("start_time", { ascending: true });
    if (error) {
        throw error;
    }
    const allRows = (data ?? []);
    const helperEmailLc = helperEmail.toLowerCase();
    // 本人の行（helper_email 一致）を抽出
    const myRows = allRows.filter(function (r) {
        return (r.helper_email ?? "").toLowerCase() === helperEmailLc;
    });
    return myRows.map(function (row) {
        // 同 (client, start_time) で本人以外のヘルパー名を抽出（合同シフト）
        const coHelperSet = new Set();
        for (const other of allRows) {
            if (other === row)
                continue;
            if (other.client !== row.client)
                continue;
            if (other.start_time !== row.start_time)
                continue;
            if (!other.name)
                continue;
            if (other.name === row.name)
                continue;
            coHelperSet.add(other.name);
        }
        return {
            id: row.id,
            helperName: row.name,
            userName: row.client,
            startTime: row.start_time,
            endTime: row.end_time,
            haisha: row.haisha,
            task: row.task,
            summary: row.summary,
            coHelpers: Array.from(coHelperSet),
        };
    });
}
/**
 * 対象日に応じてデータソースを切り替える。
 * 2026年7月以前は旧DB（schedule_web_v）、8月以降は sub2（schedule_entries）。
 * 旧DB経路 fetchTomorrowScheduleByHelperEmail は一切変更していない。
 */
async function fetchTomorrowScheduleItems(helperEmail, date) {
    if ((0, scheduleSource_1.isSub2Date)(date)) {
        return (0, scheduleSource_1.fetchSub2ScheduleByHelperEmail)(helperEmail, date, "tomorrow-schedule");
    }
    return fetchTomorrowScheduleByHelperEmail(helperEmail, date);
}
async function handleTomorrowSchedule(req, res) {
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
        const tomorrowDate = (0, helperSummary_1.getDateJstByOffset)(1);
        const items = await fetchTomorrowScheduleItems(helperEmail, tomorrowDate);
        res.status(200).json({
            ok: true,
            date: tomorrowDate,
            helperEmail: helperEmail,
            count: items.length,
            items: items,
        });
    }
    catch (error) {
        console.error("[tomorrow-schedule] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
