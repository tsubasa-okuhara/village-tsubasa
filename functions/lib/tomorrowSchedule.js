"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTomorrowScheduleByHelperEmail = fetchTomorrowScheduleByHelperEmail;
exports.handleTomorrowSchedule = handleTomorrowSchedule;
const helperSummary_1 = require("./helperSummary");
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
        const items = await fetchTomorrowScheduleByHelperEmail(helperEmail, tomorrowDate);
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
